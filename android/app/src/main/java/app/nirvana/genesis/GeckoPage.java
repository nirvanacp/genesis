package app.nirvana.genesis;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import app.nirvana.genesis.ui.Ui;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Function;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;

/**
 * A website context in GeckoView. The built-in extension (`assets/genesis-gecko/`) connects a
 * native port from each top-level document; on the context's declared origins the page sends the
 * start script through it, and the port carries the page agent's messages both ways, as WebView's
 * message listener does. Navigation reports match `WebViewPage`'s: `documentStarted` for a new
 * document, then `contextNavigated` with the session history's index and size. A popup is a page
 * of its own session, which GeckoView opens, so the website keeps `window.opener`.
 */
final class GeckoPage implements WebsitePage {
    /** How long a page that took a link click has to start moving before the URL loads anyway. */
    private static final long LINK_FALLBACK_MS = 1000;
    /** The cache folder chosen files are copied into for upload. */
    private static final String UPLOADS = "gecko-uploads";
    private static final java.util.concurrent.ExecutorService UPLOAD_WORKER = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static boolean uploadsCleared;

    private final Activity activity;
    private final Views.Listener listener;
    private final Views.Page page;
    private final String startScript;
    private final GeckoSession session;
    private final GeckoView view;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Loads asked for before the bridge extension was ready, in order. */
    private List<Runnable> waiting = new ArrayList<>();
    /** The current top-level document's port, whatever its origin; null between documents. */
    private WebExtension.Port port;
    /** Whether `port`'s document is on a declared origin, so the agent runs there and may message. */
    private boolean bound;
    private String url;
    private History history = new History(-1, 0, List.of());
    /** A document started loading since the last commit, so the next commit is a new document. */
    private boolean startedSinceCommit;
    /** The loading document was reported to the listener, by its bridge or its commit, whichever came first. */
    private boolean startReported;
    /** The entry a history move or a replacing load asked for; the next commit lands there. */
    private int expectedIndex = -1;
    private String lastUrl;
    /** Counts navigation starts and commits, so a fallback can see whether anything moved. */
    private int moves;
    /** The id of the latest followLink request, and what to do with the page's answer to it. */
    private int followed;
    private Consumer<Boolean> following;
    private boolean canGoBack;
    private boolean destroyed;
    /** The website's own dialog (alert, confirm, prompt) on screen; null when none. */
    private android.app.Dialog dialog;
    /** Where the view sat before the website took the full screen; null when not full screen. */
    private ViewGroup fullParent;
    private int fullIndex;
    private ViewGroup.LayoutParams fullParams;

    /** A popup's session stays closed until it loads, or until GeckoView opens it for the opener's window. */
    private GeckoPage(Activity activity, Views.Listener listener, Views.Page page, String startScript, boolean open) {
        this.activity = activity;
        this.listener = listener;
        this.page = page;
        this.startScript = startScript;
        GeckoSites sites = (GeckoSites) page.site;
        session = new GeckoSession(new GeckoSessionSettings.Builder()
            .contextId(sites.contextId())
            .allowJavascript(true)
            .build());
        session.setNavigationDelegate(new Navigation());
        session.setProgressDelegate(new Progress());
        session.setHistoryDelegate(new HistoryWatch());
        session.setContentDelegate(new Content());
        session.setPromptDelegate(new Prompts());
        session.setPermissionDelegate(new Permissions());
        view = new GeckoView(activity);
        if (open) session.open(GeckoEngine.runtime(activity));
        view.setSession(session);
        // GeckoView's page tree ignores the view's accessibility importance; only a shown page has one.
        session.getAccessibility().setView(null);
        // Hidden contexts keep running, as they do in WebView; only the revealed one has focus.
        session.setActive(true);
        session.setFocused(false);
        GeckoEngine.extension(activity, extension -> {
            if (destroyed) return;
            session.getWebExtensionController().setMessageDelegate(extension, new Bridge(), "genesis");
            List<Runnable> loads = waiting;
            waiting = null;
            for (Runnable load : loads) load.run();
        }, () -> {
            // Without its bridge the page can't run; the host offers Reload, which opens it again.
            if (!destroyed) listener.rendererGone(page);
        });
    }

    /** A context view. Its bridge and start script apply on the page's declared origins only. */
    static GeckoPage document(Activity activity, Views.Listener listener, Views.Page page, String startScript) {
        GeckoPage tab = new GeckoPage(activity, listener, page, startScript, true);
        tab.view.setFocusable(false);
        tab.view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return tab;
    }

    /** A window the revealed context opened, in the opener's profile; no bridge or start script. */
    static GeckoPage popup(Activity activity, Views.Listener listener, Views.Page page) {
        return new GeckoPage(activity, listener, page, null, false);
    }

    /** Runs a load now, or once the bridge extension is ready. */
    private void whenReady(Runnable load) {
        if (waiting != null) waiting.add(load);
        else if (!destroyed) {
            if (!session.isOpen()) session.open(GeckoEngine.runtime(activity));
            load.run();
        }
    }

    @Override public View view() { return view; }

    @Override public String url() { return url; }

    @Override public void load(String url) { whenReady(() -> session.loadUri(url)); }

    @Override public void replace(String url) {
        whenReady(() -> {
            expectedIndex = Math.max(0, history.index());
            session.load(new GeckoSession.Loader().uri(url).flags(GeckoSession.LOAD_FLAGS_REPLACE_HISTORY));
        });
    }

    /**
     * The bridge content script runs the same link step as WebView's FOLLOW_LINK script. Without a
     * port, or when the page does not take the click, or takes it and does not move within
     * LINK_FALLBACK_MS, the URL loads.
     */
    @Override public void followLink(String url) {
        if (port == null) { load(url); return; }
        int id = ++followed;
        int before = moves;
        following = taken -> {
            if (!taken) { load(url); return; }
            main.postDelayed(() -> { if (!destroyed && moves == before) load(url); }, LINK_FALLBACK_MS);
        };
        try { port.postMessage(new JSONObject().put("type", "followLink").put("id", id).put("url", url)); }
        catch (JSONException error) { load(url); }
    }

    /** GeckoView moves to the exact entry; there is no entry skipping to work around, as in WebView. */
    @Override public void go(int delta, Runnable unmoved) {
        int target = history.index() + delta;
        if (history.index() < 0 || target < 0 || target >= history.size()) { main.post(unmoved); return; }
        expectedIndex = target;
        session.gotoHistoryIndex(target);
    }

    @Override public void reload() { session.reload(); }

    @Override public History history() { return history; }

    @Override public boolean canGoBack() { return canGoBack; }

    @Override public void goBack() {
        if (history.index() > 0) expectedIndex = history.index() - 1;
        session.goBack();
    }

    @Override public void post(String message) {
        if (port == null || !bound) return;
        try { port.postMessage(new JSONObject().put("type", "message").put("data", message)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public Object channel() { return bound ? port : null; }

    /** The bridge carries text only; bytes go as base64 messages. */
    @Override public boolean postsBytes() { return false; }

    @Override public void postBytes(byte[] bytes) {}

    @Override public String userAgent() { return GeckoSession.getDefaultUserAgent(); }

    @Override public void input(JSONArray events) throws Input.Refused { Input.dispatch(view, events); }

    /** A hidden page loses focus, its page tree for accessibility services and its open dialog. */
    @Override public void setRevealed(boolean revealed) {
        if (!revealed) view.clearFocus();
        session.setFocused(revealed);
        session.getAccessibility().setView(revealed ? view : null);
        if (!revealed) closeDialog();
    }

    /** The runtime follows Android's font size and appearance for every page. */
    @Override public void configurationChanged() {}

    @Override public void destroy() {
        destroyed = true;
        main.removeCallbacksAndMessages(null);
        port = null;
        closeDialog();
        page.fullScreen = false;
        forgetAnswers();
        if (fullParent != null) {
            fullParent = null;
            listener.hideFullScreen();
        }
        if (view.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) view.getParent()).removeView(view);
        view.releaseSession();
        session.close();
    }

    /**
     * GeckoView sends its history list about a second after the commit, too late for the applet,
     * so a commit is reported at once with the entry it must have landed on: the one a history move
     * or a replacing load asked for, the same one for a reload, otherwise a new entry after the
     * current one, which drops the entries forward of it.
     */
    private void committed(Views.Committed committed) {
        int index = history.index();
        List<String> urls = new ArrayList<>(history.urls());
        if (expectedIndex >= 0 && expectedIndex < Math.max(urls.size(), 1)) index = expectedIndex;
        else if (!committed.reload || index < 0) {
            index++;
            urls = new ArrayList<>(urls.subList(0, Math.min(index, urls.size())));
            urls.add(committed.url);
        }
        expectedIndex = -1;
        if (index < urls.size()) urls.set(index, committed.url);
        else urls.add(committed.url);
        history = new History(index, urls.size(), urls);
        report(committed);
    }

    private void report(Views.Committed committed) {
        committed.index = history.index();
        committed.size = history.size();
        lastUrl = committed.url;
        if (page.opener != null) listener.popupNavigated(page, committed.url);
        else listener.contextNavigated(page, committed);
    }

    private final class Bridge implements WebExtension.MessageDelegate {
        /** A port from this session's top-level document. One from a frame or another session is refused. */
        @Override public void onConnect(WebExtension.Port connected) {
            if (destroyed || !connected.sender.isTopLevel() || connected.sender.session != session) { connected.disconnect(); return; }
            port = connected;
            // The bridge can connect before GeckoView reports the commit; the shell must see the new
            // document before the agent's first message, as WebView's onPageStarted guarantees.
            documentStarted(connected.sender.url);
            bound = startScript != null && page.origins.contains(Views.origin(connected.sender.url));
            connected.setDelegate(new WebExtension.PortDelegate() {
                @Override public void onPortMessage(Object message, WebExtension.Port from) {
                    if (from == port && message instanceof JSONObject) received((JSONObject) message);
                }

                @Override public void onDisconnect(WebExtension.Port from) {
                    if (from == port) port = null;
                }
            });
        }
    }

    private void received(JSONObject message) {
        switch (message.optString("type")) {
            case "hello" -> {
                if (!bound) return;
                try { port.postMessage(new JSONObject().put("type", "start").put("code", startScript)); }
                catch (JSONException ignored) { /* Unreachable for string values. */ }
            }
            case "message" -> {
                if (!bound || !message.has("data")) return;
                String data = message.optString("data");
                if (data.startsWith(Views.BLOB_MESSAGE)) listener.blobMessage(page, data);
                else listener.documentMessage(page, data);
            }
            case "windowLink" -> windowLink(message.optString("url"));
            case "followed" -> {
                if (message.optInt("id") != followed || following == null) return;
                Consumer<Boolean> result = following;
                following = null;
                result.accept(message.optBoolean("taken"));
            }
            default -> { /* An older content script's message; nothing to do. */ }
        }
    }

    /**
     * A tapped link that opens a new window, which the bridge stopped. The revealed context hands it
     * to the host, as WebView's hit test does; a popup's own windows load in place.
     */
    private void windowLink(String link) {
        String scheme = Uri.parse(link).getScheme();
        if (!"https".equals(scheme) && !"http".equals(scheme)) return;
        if (page.opener != null) { load(link); return; }
        if (!SitePolicy.usersGesture(page, true, SitePolicy.WINDOW) || !SitePolicy.mayUse(page, SitePolicy.WINDOW)) return;
        listener.useGrant(page);
        listener.windowRequested(page, link);
    }

    /** Reports a new document once, whether its bridge or its commit arrives first. */
    private void documentStarted(String location) {
        if (!startedSinceCommit || startReported) return;
        startReported = true;
        page.capturing = false;
        page.downloads = 0;
        listener.documentStarted(page, location);
    }

    private final class Navigation implements GeckoSession.NavigationDelegate {
        /**
         * A context browses any http(s) website. Another scheme is a link for another app: only the
         * revealed page may hand it over, and only from a tap, as in WebView. A new window opens
         * from the revealed context only, from a tap, and `onNewSession` puts it in the popup
         * sheet; a popup's own windows load in place.
         */
        @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, LoadRequest request) {
            String scheme = Uri.parse(request.uri).getScheme();
            boolean web = "https".equals(scheme) || "http".equals(scheme);
            boolean local = "about".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme);
            if (request.target == TARGET_WINDOW_NEW && (web || local)) {
                if (page.opener != null) {
                    if (web) session.loadUri(request.uri);
                    return GeckoResult.fromValue(AllowOrDeny.DENY);
                }
                boolean opens = SitePolicy.usersGesture(page, request.hasUserGesture, SitePolicy.WINDOW) && SitePolicy.mayUse(page, SitePolicy.WINDOW);
                if (opens) listener.useGrant(page);
                return GeckoResult.fromValue(opens ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
            }
            if (web || local) return GeckoResult.fromValue(AllowOrDeny.ALLOW);
            if (!SitePolicy.mayHandOff(page, SitePolicy.usersGesture(page, request.hasUserGesture, SitePolicy.HANDOFF))) return GeckoResult.fromValue(AllowOrDeny.DENY);
            listener.useGrant(page);
            android.content.Intent intent = Handoff.intent(request.uri);
            if (intent == null || listener.handOff(intent)) return GeckoResult.fromValue(AllowOrDeny.DENY);
            String fallback = Handoff.fallback(request.uri);
            if (fallback != null) session.loadUri(fallback);
            else android.widget.Toast.makeText(activity, "No app can open this link", android.widget.Toast.LENGTH_SHORT).show();
            return GeckoResult.fromValue(AllowOrDeny.DENY);
        }

        /** GeckoView reports the commit here, before the history list. */
        @Override public void onLocationChange(GeckoSession s, String location, List<GeckoSession.PermissionDelegate.ContentPermission> permissions, Boolean gesture) {
            if (location == null || location.equals("about:blank") && url == null) return;
            url = location;
            moves++;
            Views.Committed committed = new Views.Committed();
            committed.url = location;
            committed.sameDocument = !startedSinceCommit;
            committed.reload = startedSinceCommit && expectedIndex < 0 && location.equals(lastUrl);
            if (startedSinceCommit) documentStarted(location);
            startedSinceCommit = false;
            committed(committed);
        }

        @Override public void onCanGoBack(GeckoSession s, boolean can) { canGoBack = can; }

        /**
         * The window `onLoadRequest` allowed, which used any window grant; the shell checks again
         * that this page may open one. GeckoView opens the popup's session itself.
         */
        @Override public GeckoResult<GeckoSession> onNewSession(GeckoSession s, String uri) {
            if (page.opener != null) return null;
            Views.Page popup = listener.openWindow(page);
            if (popup == null) return null;
            // A Gecko opener's popup is always a Gecko page (Views.popup follows the opener's engine).
            return GeckoResult.fromValue(((GeckoPage) popup.tab).session);
        }
    }

    private final class Progress implements GeckoSession.ProgressDelegate {
        @Override public void onPageStart(GeckoSession s, String location) {
            startedSinceCommit = true;
            startReported = false;
            moves++;
        }

        /** A load that ended without a commit, such as a download, leaves the next commit in the same document. */
        @Override public void onPageStop(GeckoSession s, boolean success) { startedSinceCommit = false; }
    }

    /**
     * GeckoView's own list replaces the reported one. When it disagrees, as after a website's own
     * history.go(), the shell gets the true entry as a same-document report of the current URL.
     */
    private final class HistoryWatch implements GeckoSession.HistoryDelegate {
        @Override public void onHistoryStateChange(GeckoSession s, HistoryList list) {
            // The list of the blank document a session opens with; the first commit replaces it.
            if (url == null || destroyed) return;
            List<String> urls = new ArrayList<>();
            for (HistoryItem item : list) urls.add(item.getUri());
            boolean moved = list.getCurrentIndex() != history.index() || urls.size() != history.size();
            history = new History(list.getCurrentIndex(), urls.size(), urls);
            if (!moved) return;
            Views.Committed corrected = new Views.Committed();
            corrected.url = url;
            corrected.sameDocument = true;
            report(corrected);
        }
    }

    private final class Content implements GeckoSession.ContentDelegate {
        @Override public void onCrash(GeckoSession s) { listener.rendererGone(page); }

        @Override public void onKill(GeckoSession s) { listener.rendererGone(page); }

        @Override public void onCloseRequest(GeckoSession s) { if (page.opener != null) listener.closeWindow(page); }

        /**
         * The website's element fills the page's own view, so the view itself goes full screen and
         * returns to its container afterwards. Only the shown website goes full screen, or a hidden
         * context with a fullscreen grant; a refused request exits after this call returns.
         */
        @Override public void onFullScreen(GeckoSession s, boolean full) {
            if (!full) { leaveFullScreen(); return; }
            if (fullParent != null) return;
            if (!SitePolicy.mayUse(page, SitePolicy.FULLSCREEN) || !(view.getParent() instanceof ViewGroup)) {
                main.post(() -> { if (!destroyed) session.exitFullScreen(); });
                return;
            }
            listener.useGrant(page);
            fullParent = (ViewGroup) view.getParent();
            fullIndex = fullParent.indexOfChild(view);
            fullParams = view.getLayoutParams();
            fullParent.removeView(view);
            page.fullScreen = true;
            listener.showFullScreen(new Requests.FullScreen(page, view, () -> {
                restoreView();
                if (!destroyed) session.exitFullScreen();
            }));
        }

        /**
         * A response GeckoView does not show, such as an attachment, goes to the shell's download.
         * The body GeckoView already fetched with the page's session is saved as is, so the file
         * comes with the site's cookies; GeckoView has no cookie read for a second fetch.
         */
        @Override public void onExternalResponse(GeckoSession s, org.mozilla.geckoview.WebResponse response) {
            String type = header(response.headers, "Content-Type");
            if (type != null && type.contains(";")) type = type.substring(0, type.indexOf(';')).trim();
            String disposition = header(response.headers, "Content-Disposition");
            if (response.body == null) {
                listener.download(page, response.uri, GeckoSession.getDefaultUserAgent(), disposition, type);
                return;
            }
            // The body arrives decoded, so a `Content-Length` of an encoded response is not its size.
            long length = header(response.headers, "Content-Encoding") != null ? -1 : length(header(response.headers, "Content-Length"));
            listener.downloadResponse(page, response.uri, response.body, disposition, type, length);
        }
    }

    /** A `Content-Length` value, or -1 when it is missing or not a number. */
    private static long length(String value) {
        if (value == null) return -1;
        try { return Long.parseLong(value.trim()); } catch (NumberFormatException error) { return -1; }
    }

    private static String header(Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> entry : headers.entrySet()) if (name.equalsIgnoreCase(entry.getKey())) return entry.getValue();
        return null;
    }

    /**
     * GeckoView reads chosen files from paths, and can't resolve a document provider's `content:`
     * URIs, so each file is copied into the cache first, off the main thread. `done` runs on the main
     * thread with the copies' `file:` URIs, or null when one couldn't be read. A process's first
     * copy clears the copies of the one before, whose pages are gone.
     */
    private void copyForUpload(Uri[] files, Consumer<Uri[]> done) {
        android.content.ContentResolver resolver = activity.getContentResolver();
        java.io.File root = new java.io.File(activity.getCacheDir(), UPLOADS);
        UPLOAD_WORKER.execute(() -> {
            if (!uploadsCleared) { deleteTree(root); uploadsCleared = true; }
            java.io.File folder = new java.io.File(root, java.util.UUID.randomUUID().toString());
            Uri[] copies = new Uri[files.length];
            try {
                if (!folder.mkdirs()) throw new java.io.IOException("No upload folder");
                for (int i = 0; i < files.length; i++) {
                    java.io.File copy = new java.io.File(new java.io.File(folder, String.valueOf(i)), uploadName(resolver, files[i]));
                    if (!copy.getParentFile().mkdirs()) throw new java.io.IOException("No upload folder");
                    try (java.io.InputStream in = resolver.openInputStream(files[i]);
                         java.io.OutputStream out = new java.io.FileOutputStream(copy)) {
                        if (in == null) throw new java.io.IOException("Unreadable file");
                        byte[] buffer = new byte[64 * 1024];
                        for (int read; (read = in.read(buffer)) != -1; ) out.write(buffer, 0, read);
                    }
                    copies[i] = Uri.fromFile(copy);
                }
            } catch (java.io.IOException | RuntimeException error) {
                deleteTree(folder);
                copies = null;
            }
            Uri[] result = copies;
            main.post(() -> done.accept(result));
        });
    }

    /** The file's own name, so the page sees it; path separators and an empty name become safe ones. */
    private static String uploadName(android.content.ContentResolver resolver, Uri uri) {
        String name = null;
        try (android.database.Cursor cursor = resolver.query(uri, new String[] {android.provider.OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
        } catch (RuntimeException ignored) { /* Falls back to a generic name. */ }
        if (name != null) name = name.replace('/', '_').replace('\0', '_').trim();
        return name == null || name.isEmpty() || name.equals(".") || name.equals("..") ? "file" : name;
    }

    private static void deleteTree(java.io.File file) {
        java.io.File[] children = file.listFiles();
        if (children != null) for (java.io.File child : children) deleteTree(child);
        file.delete();
    }

    private void leaveFullScreen() {
        if (fullParent == null) return;
        listener.hideFullScreen();
        restoreView();
    }

    /** Puts the view back where it was before the full screen. */
    private void restoreView() {
        page.fullScreen = false;
        ViewGroup parent = fullParent;
        fullParent = null;
        if (parent == null || destroyed) return;
        if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
        view.setBackground(null);
        parent.addView(view, Math.min(fullIndex, parent.getChildCount()), fullParams);
    }

    private void closeDialog() {
        android.app.Dialog shown = dialog;
        dialog = null;
        if (shown != null) shown.dismiss();
    }

    /**
     * One website prompt on screen, in one dialog or several in turn. The prompt is answered once:
     * by `answer`, or with a dismissal when its last dialog closes unanswered, as when the page is
     * hidden or destroyed. When GeckoView withdraws the prompt, its dialog closes.
     */
    private final class Asking {
        private final GeckoSession.PromptDelegate.BasePrompt prompt;
        final GeckoResult<GeckoSession.PromptDelegate.PromptResponse> result = new GeckoResult<>();
        private boolean answered;
        /** The prompt's dialog on screen; one that a following dialog replaced no longer answers. */
        private android.app.Dialog current;

        Asking(GeckoSession.PromptDelegate.BasePrompt prompt) {
            this.prompt = prompt;
            prompt.setDelegate(new GeckoSession.PromptDelegate.PromptInstanceDelegate() {
                @Override public void onPromptDismiss(GeckoSession.PromptDelegate.BasePrompt dismissed) {
                    answered = true;
                    if (current != null) current.dismiss();
                }
            });
        }

        void answer(GeckoSession.PromptDelegate.PromptResponse response) {
            if (answered) return;
            answered = true;
            result.complete(response);
        }

        /** Shows `next` as the prompt's dialog, in place of the one before. */
        void show(android.app.Dialog next) {
            current = next;
            dialog = next;
            next.setOnDismissListener(d -> {
                if (dialog == next) dialog = null;
                if (current == next && !answered) answer(prompt.dismiss());
            });
            next.show();
        }
    }

    /**
     * Starts a prompt's dialogs, only while the page is shown; a hidden page's prompt is dismissed,
     * as the page's own navigation dismisses an open one. Returns null when it was dismissed.
     */
    private Asking ask(GeckoSession.PromptDelegate.BasePrompt prompt) {
        if (!SitePolicy.mayShowUi(page)) return null;
        closeDialog();
        return new Asking(prompt);
    }

    /**
     * One website dialog. `field` is the text field's start value, or null for none; `ok` turns
     * the field's text into the answer.
     */
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> showDialog(GeckoSession.PromptDelegate.BasePrompt prompt,
            String message, String field, boolean cancel, Function<String, GeckoSession.PromptDelegate.PromptResponse> ok) {
        Asking asking = ask(prompt);
        if (asking == null) return GeckoResult.fromValue(prompt.dismiss());
        android.widget.EditText input = null;
        if (field != null) {
            input = new android.widget.EditText(activity);
            input.setSingleLine(true);
            input.setText(field);
        }
        android.widget.EditText text = input;
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(activity)
            .setTitle(Ui.host(Views.origin(url == null ? "" : url)) + " says")
            .setMessage(message)
            .setPositiveButton(android.R.string.ok, (d, w) -> asking.answer(ok.apply(text == null ? null : text.getText().toString())));
        if (cancel) builder.setNegativeButton(android.R.string.cancel, null);
        if (text != null) {
            android.widget.FrameLayout frame = new android.widget.FrameLayout(activity);
            int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
            frame.setPadding(pad, 0, pad, 0);
            frame.addView(text);
            builder.setView(frame);
        }
        asking.show(builder.create());
        return asking.result;
    }

    /**
     * A `<select>`: single and menu choices answer on a tap, a multiple choice with OK. Group
     * labels show as disabled rows above their options; separators are left out.
     */
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> choose(GeckoSession.PromptDelegate.ChoicePrompt prompt) {
        Asking asking = ask(prompt);
        if (asking == null) return GeckoResult.fromValue(prompt.dismiss());
        List<GeckoSession.PromptDelegate.ChoicePrompt.Choice> rows = new ArrayList<>();
        List<Boolean> enabled = new ArrayList<>();
        addChoices(prompt.choices, false, rows, enabled);
        boolean multiple = prompt.type == GeckoSession.PromptDelegate.ChoicePrompt.Type.MULTIPLE;
        boolean single = prompt.type == GeckoSession.PromptDelegate.ChoicePrompt.Type.SINGLE;
        List<String> labels = new ArrayList<>();
        for (GeckoSession.PromptDelegate.ChoicePrompt.Choice choice : rows) labels.add(choice.label == null ? "" : choice.label);
        int layout = multiple ? android.R.layout.simple_list_item_multiple_choice
            : single ? android.R.layout.simple_list_item_single_choice : android.R.layout.simple_list_item_1;
        android.widget.ArrayAdapter<String> adapter = new android.widget.ArrayAdapter<>(activity, layout, labels) {
            @Override public boolean areAllItemsEnabled() { return false; }

            @Override public boolean isEnabled(int position) { return enabled.get(position); }

            @Override public View getView(int position, View convert, ViewGroup parent) {
                View row = super.getView(position, convert, parent);
                row.setEnabled(enabled.get(position));
                return row;
            }
        };
        android.widget.ListView list = new android.widget.ListView(activity);
        list.setAdapter(adapter);
        list.setChoiceMode(multiple ? android.widget.ListView.CHOICE_MODE_MULTIPLE
            : single ? android.widget.ListView.CHOICE_MODE_SINGLE : android.widget.ListView.CHOICE_MODE_NONE);
        for (int i = 0; i < rows.size(); i++) if (rows.get(i).selected && enabled.get(i)) list.setItemChecked(i, true);
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(activity).setView(list);
        String title = prompt.title != null && !prompt.title.isEmpty() ? prompt.title : prompt.message;
        if (title != null && !title.isEmpty()) builder.setTitle(title);
        if (multiple) {
            builder.setNegativeButton(android.R.string.cancel, null).setPositiveButton(android.R.string.ok, (d, w) -> {
                List<GeckoSession.PromptDelegate.ChoicePrompt.Choice> chosen = new ArrayList<>();
                // A disabled option the website selected stays selected; the user cannot change it.
                for (int i = 0; i < rows.size(); i++) {
                    GeckoSession.PromptDelegate.ChoicePrompt.Choice row = rows.get(i);
                    boolean kept = enabled.get(i) ? list.isItemChecked(i) : row.items == null && row.selected;
                    if (kept) chosen.add(row);
                }
                asking.answer(prompt.confirm(chosen.toArray(new GeckoSession.PromptDelegate.ChoicePrompt.Choice[0])));
            });
        }
        android.app.Dialog shown = builder.create();
        if (!multiple) {
            list.setOnItemClickListener((parent, row, position, id) -> {
                asking.answer(prompt.confirm(rows.get(position)));
                shown.dismiss();
            });
        }
        asking.show(shown);
        return asking.result;
    }

    /** Flattens choices into rows; a group's label is a disabled row, and a disabled group disables its options. */
    private static void addChoices(GeckoSession.PromptDelegate.ChoicePrompt.Choice[] choices, boolean disabled,
            List<GeckoSession.PromptDelegate.ChoicePrompt.Choice> rows, List<Boolean> enabled) {
        if (choices == null) return;
        for (GeckoSession.PromptDelegate.ChoicePrompt.Choice choice : choices) {
            if (choice.separator) continue;
            boolean off = disabled || choice.disabled;
            rows.add(choice);
            enabled.add(choice.items == null && !off);
            if (choice.items != null) addChoices(choice.items, off, rows, enabled);
        }
    }

    /**
     * A date, month, time or local date and time input: Android's date picker, then its time
     * picker for a date and time. The pickers start at the input's value and keep within its
     * minimum and maximum dates. Clear empties the input. A week input has no Android picker and
     * is dismissed.
     */
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> pickDateTime(GeckoSession.PromptDelegate.DateTimePrompt prompt) {
        int type = prompt.type;
        if (type == GeckoSession.PromptDelegate.DateTimePrompt.Type.WEEK) return GeckoResult.fromValue(prompt.dismiss());
        Asking asking = ask(prompt);
        if (asking == null) return GeckoResult.fromValue(prompt.dismiss());
        String value = prompt.defaultValue == null ? "" : prompt.defaultValue;
        int[] date = parseDate(type == GeckoSession.PromptDelegate.DateTimePrompt.Type.TIME ? "" : value);
        int[] time = parseTime(type == GeckoSession.PromptDelegate.DateTimePrompt.Type.TIME ? value
            : value.indexOf('T') >= 0 ? value.substring(value.indexOf('T') + 1) : "");
        if (type == GeckoSession.PromptDelegate.DateTimePrompt.Type.TIME) { asking.show(timeDialog(asking, prompt, time, null)); return asking.result; }
        android.app.DatePickerDialog picker = new android.app.DatePickerDialog(activity, (view, year, month, day) -> {
            int[] picked = { year, month, day };
            if (type == GeckoSession.PromptDelegate.DateTimePrompt.Type.DATETIME_LOCAL) asking.show(timeDialog(asking, prompt, time, picked));
            else if (type == GeckoSession.PromptDelegate.DateTimePrompt.Type.MONTH) asking.answer(prompt.confirm(String.format(java.util.Locale.ROOT, "%04d-%02d", year, month + 1)));
            else asking.answer(prompt.confirm(formatDate(picked)));
        }, date[0], date[1], date[2]);
        int[] min = parseDateOrNull(prompt.minValue), max = parseDateOrNull(prompt.maxValue);
        try {
            if (min != null) picker.getDatePicker().setMinDate(millis(min));
            if (max != null) picker.getDatePicker().setMaxDate(millis(max));
        } catch (IllegalArgumentException ignored) { /* A minimum after the maximum; the picker keeps its full range. */ }
        picker.setButton(android.content.DialogInterface.BUTTON_NEUTRAL, "Clear", (d, w) -> asking.answer(prompt.confirm("")));
        asking.show(picker);
        return asking.result;
    }

    /** The time picker; with `date`, it completes a local date and time. */
    private android.app.Dialog timeDialog(Asking asking, GeckoSession.PromptDelegate.DateTimePrompt prompt, int[] time, int[] date) {
        android.app.TimePickerDialog picker = new android.app.TimePickerDialog(activity, (view, hour, minute) -> {
            String picked = String.format(java.util.Locale.ROOT, "%02d:%02d", hour, minute);
            asking.answer(prompt.confirm(date == null ? picked : formatDate(date) + "T" + picked));
        }, time[0], time[1], android.text.format.DateFormat.is24HourFormat(activity));
        picker.setButton(android.content.DialogInterface.BUTTON_NEUTRAL, "Clear", (d, w) -> asking.answer(prompt.confirm("")));
        return picker;
    }

    private static String formatDate(int[] date) {
        return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", date[0], date[1] + 1, date[2]);
    }

    /** `yyyy-MM-dd` or `yyyy-MM` (the start of an input's value) as year, zero-based month and day; today when unreadable. */
    private static int[] parseDate(String value) {
        int[] date = parseDateOrNull(value);
        if (date != null) return date;
        java.util.Calendar now = java.util.Calendar.getInstance();
        return new int[] { now.get(java.util.Calendar.YEAR), now.get(java.util.Calendar.MONTH), now.get(java.util.Calendar.DAY_OF_MONTH) };
    }

    private static int[] parseDateOrNull(String value) {
        if (value == null) return null;
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("^(\\d{4,})-(\\d{2})(?:-(\\d{2}))?").matcher(value);
        if (!match.find()) return null;
        try {
            int month = Integer.parseInt(match.group(2)) - 1;
            int day = match.group(3) == null ? 1 : Integer.parseInt(match.group(3));
            if (month < 0 || month > 11 || day < 1 || day > 31) return null;
            return new int[] { Integer.parseInt(match.group(1)), month, day };
        } catch (NumberFormatException error) {
            return null;
        }
    }

    /** `HH:mm`, with optional seconds, as hour and minute; the current time when unreadable. */
    private static int[] parseTime(String value) {
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("^(\\d{2}):(\\d{2})").matcher(value);
        if (match.find()) {
            int hour = Integer.parseInt(match.group(1)), minute = Integer.parseInt(match.group(2));
            if (hour < 24 && minute < 60) return new int[] { hour, minute };
        }
        java.util.Calendar now = java.util.Calendar.getInstance();
        return new int[] { now.get(java.util.Calendar.HOUR_OF_DAY), now.get(java.util.Calendar.MINUTE) };
    }

    /** The start of the local day, as the date picker's limits take it. */
    private static long millis(int[] date) {
        java.util.Calendar day = java.util.Calendar.getInstance();
        day.clear();
        day.set(date[0], date[1], date[2]);
        return day.getTimeInMillis();
    }

    /**
     * A hidden context's dialog shows as Genesis's own dialog over the applet UI, and the website
     * stays hidden, as in WebView. Returns null for any other page, which shows its own.
     */
    private GeckoResult<GeckoSession.PromptDelegate.PromptResponse> hiddenDialog(GeckoSession.PromptDelegate.BasePrompt prompt,
            String kind, String message, String defaultValue, Function<String, GeckoSession.PromptDelegate.PromptResponse> ok) {
        if (!page.isContext() || page.isRevealed()) return null;
        GeckoResult<GeckoSession.PromptDelegate.PromptResponse> result = new GeckoResult<>();
        listener.jsDialog(page, kind, message == null ? "" : message, defaultValue, new Requests.DialogResult() {
            @Override public void confirm(String value) { if (!prompt.isComplete()) result.complete(ok.apply(value)); }

            @Override public void cancel() { if (!prompt.isComplete()) result.complete(prompt.dismiss()); }
        });
        return result;
    }

    private final class Prompts implements GeckoSession.PromptDelegate {
        @Override public GeckoResult<PromptResponse> onAlertPrompt(GeckoSession s, AlertPrompt prompt) {
            GeckoResult<PromptResponse> hidden = hiddenDialog(prompt, "alert", prompt.message, null, text -> prompt.dismiss());
            return hidden != null ? hidden : showDialog(prompt, prompt.message, null, false, text -> prompt.dismiss());
        }

        @Override public GeckoResult<PromptResponse> onButtonPrompt(GeckoSession s, ButtonPrompt prompt) {
            GeckoResult<PromptResponse> hidden = hiddenDialog(prompt, "confirm", prompt.message, null, text -> prompt.confirm(ButtonPrompt.Type.POSITIVE));
            return hidden != null ? hidden : showDialog(prompt, prompt.message, null, true, text -> prompt.confirm(ButtonPrompt.Type.POSITIVE));
        }

        @Override public GeckoResult<PromptResponse> onTextPrompt(GeckoSession s, TextPrompt prompt) {
            String start = prompt.defaultValue == null ? "" : prompt.defaultValue;
            GeckoResult<PromptResponse> hidden = hiddenDialog(prompt, "prompt", prompt.message, prompt.defaultValue, prompt::confirm);
            return hidden != null ? hidden : showDialog(prompt, prompt.message, start, true, prompt::confirm);
        }

        /** A hidden context asks through the shell; the shown page keeps GeckoView's default, which leaves. */
        @Override public GeckoResult<PromptResponse> onBeforeUnloadPrompt(GeckoSession s, BeforeUnloadPrompt prompt) {
            return hiddenDialog(prompt, "beforeunload", "", null, text -> prompt.confirm(AllowOrDeny.ALLOW));
        }

        /** A `<select>`'s options; a hidden page's is dismissed, as its file input is. */
        @Override public GeckoResult<PromptResponse> onChoicePrompt(GeckoSession s, ChoicePrompt prompt) { return choose(prompt); }

        /** A date or time input's picker; a hidden page's is dismissed, as its file input is. */
        @Override public GeckoResult<PromptResponse> onDateTimePrompt(GeckoSession s, DateTimePrompt prompt) { return pickDateTime(prompt); }

        /** The same file selection as WebView's chooser; a hidden page gets none. */
        @Override public GeckoResult<PromptResponse> onFilePrompt(GeckoSession s, FilePrompt prompt) {
            if (!SitePolicy.mayShowUi(page)) return GeckoResult.fromValue(prompt.dismiss());
            GeckoResult<PromptResponse> result = new GeckoResult<>();
            Requests.FileRequest request = new Requests.FileRequest(prompt.mimeTypes, prompt.type == FilePrompt.Type.MULTIPLE,
                prompt.type != FilePrompt.Type.FOLDER, files -> {
                    if (prompt.isComplete()) return;
                    if (files == null || files.length == 0) { result.complete(prompt.dismiss()); return; }
                    copyForUpload(files, copies -> {
                        if (prompt.isComplete()) return;
                        result.complete(destroyed || copies == null ? prompt.dismiss() : prompt.confirm(activity, copies));
                    });
                });
            if (!listener.chooseFiles(page, request)) request.cancel();
            return result;
        }

        /**
         * The site asks for a client certificate from Android's key store, as WebView does. A hidden
         * page gets none and the handshake fails; Reload asks once the page is shown.
         */
        @Override public GeckoResult<PromptResponse> onRequestCertificate(GeckoSession s, CertificateRequest request) {
            if (!SitePolicy.mayShowUi(page)) return GeckoResult.fromValue(request.dismiss());
            GeckoResult<PromptResponse> result = new GeckoResult<>();
            android.security.KeyChain.choosePrivateKeyAlias(activity, alias -> main.post(() -> {
                if (request.isComplete()) return;
                result.complete(alias == null ? request.dismiss() : request.confirm(alias));
            }), null, request.issuers, request.host, -1, null);
            return result;
        }

        /** A hidden page can't ask; its server's error page shows, as in WebView. */
        @Override public GeckoResult<PromptResponse> onAuthPrompt(GeckoSession s, AuthPrompt prompt) {
            if (!SitePolicy.mayShowUi(page)) return GeckoResult.fromValue(prompt.dismiss());
            GeckoResult<PromptResponse> result = new GeckoResult<>();
            boolean onlyPassword = (prompt.authOptions.flags & AuthPrompt.AuthOptions.Flags.ONLY_PASSWORD) != 0;
            String host = Uri.parse(prompt.authOptions.uri == null ? "" : prompt.authOptions.uri).getHost();
            listener.httpAuth(page, new Requests.AuthRequest() {
                @Override public void proceed(String user, String password) {
                    if (!prompt.isComplete()) result.complete(onlyPassword ? prompt.confirm(password) : prompt.confirm(user, password));
                }

                @Override public void cancel() { if (!prompt.isComplete()) result.complete(prompt.dismiss()); }
            }, host == null ? "" : host, null);
            return result;
        }
    }

    /**
     * Permissions follow WebView's: website pages get protected media (EME) without asking, shown
     * or hidden; location, camera and microphone only for the shown website, through `SiteGrants`.
     * Everything else is refused. A refusal by policy answers "ask again", so Gecko stores no denial
     * for a page that never asked the user, and the user's location answers last only as long as the
     * page, as WebView's do: `destroy` resets them. One the process ends before resetting stays.
     */
    private final class Permissions implements GeckoSession.PermissionDelegate {
        @Override public GeckoResult<Integer> onContentPermissionRequest(GeckoSession s, ContentPermission permission) {
            switch (permission.permission) {
                case PERMISSION_MEDIA_KEY_SYSTEM_ACCESS:
                case PERMISSION_AUTOPLAY_INAUDIBLE:
                    return GeckoResult.fromValue(ContentPermission.VALUE_ALLOW);
                case PERMISSION_GEOLOCATION: {
                    if (!SitePolicy.mayUse(page, SitePolicy.LOCATION)) return GeckoResult.fromValue(ContentPermission.VALUE_PROMPT);
                    listener.useGrant(page);
                    GeckoResult<Integer> result = new GeckoResult<>();
                    String origin = Views.origin(permission.uri);
                    listener.askSite(page, origin, List.of(SiteGrants.LOCATION), allowed -> {
                        // Only the user's own Allow or Don't allow is an answer Gecko keeps, until
                        // `destroy` resets it. A cancelled or interrupted question asks again.
                        int answer = allowed.contains(SiteGrants.LOCATION) ? ContentPermission.VALUE_ALLOW
                            : Boolean.FALSE.equals(page.site.grants().get(origin, SiteGrants.LOCATION)) ? ContentPermission.VALUE_DENY
                            : ContentPermission.VALUE_PROMPT;
                        if (destroyed) answer = ContentPermission.VALUE_PROMPT;
                        if (answer != ContentPermission.VALUE_PROMPT) answers.add(permission);
                        result.complete(answer);
                    });
                    return result;
                }
                default:
                    return GeckoResult.fromValue(ContentPermission.VALUE_PROMPT);
            }
        }

        /**
         * GeckoView asks for Android's permission before the website's own question. A hidden page is
         * refused first, even for a permission Genesis already holds, unless its location grant
         * covers the request. One Genesis holds is then granted; otherwise the shown website asks
         * through `SiteGrants`, whose question includes Android's request.
         */
        @Override public void onAndroidPermissionsRequest(GeckoSession s, String[] permissions, Callback callback) {
            if (permissions == null || permissions.length == 0) { callback.grant(); return; }
            Set<String> wanted = new LinkedHashSet<>();
            boolean unknown = false;
            for (String name : permissions) {
                String grant = siteGrant(name);
                if (grant == null) unknown = true;
                else wanted.add(grant);
            }
            // A hidden context's location grant is used by the website's own question, which follows.
            boolean located = !unknown && wanted.equals(Set.of(SiteGrants.LOCATION)) && SitePolicy.granted(page, SitePolicy.LOCATION);
            if (!SitePolicy.mayShowUi(page) && !located) { callback.reject(); return; }
            if (held(permissions)) { callback.grant(); return; }
            if (unknown) { callback.reject(); return; }
            listener.askSite(page, Views.origin(url == null ? "" : url), new ArrayList<>(wanted), allowed -> {
                if (allowed.containsAll(wanted)) callback.grant();
                else callback.reject();
            });
        }

        @Override public void onMediaPermissionRequest(GeckoSession s, String uri, MediaSource[] video, MediaSource[] audio, MediaCallback callback) {
            MediaSource camera = first(video, MediaSource.SOURCE_CAMERA);
            MediaSource microphone = first(audio, MediaSource.SOURCE_MICROPHONE);
            if (camera == null && microphone == null || !SitePolicy.mayShowUi(page)) { callback.reject(); return; }
            List<String> wanted = new ArrayList<>();
            if (camera != null) wanted.add(SiteGrants.CAMERA);
            if (microphone != null) wanted.add(SiteGrants.MICROPHONE);
            listener.askSite(page, Views.origin(uri), wanted, allowed -> {
                MediaSource grantVideo = allowed.contains(SiteGrants.CAMERA) ? camera : null;
                MediaSource grantAudio = allowed.contains(SiteGrants.MICROPHONE) ? microphone : null;
                if (grantVideo == null && grantAudio == null) { callback.reject(); return; }
                page.capturing = true;
                callback.grant(grantVideo, grantAudio);
            });
        }
    }

    /** The user's location answers for this page, which `destroy` turns back to "ask". */
    private final List<GeckoSession.PermissionDelegate.ContentPermission> answers = new ArrayList<>();

    private void forgetAnswers() {
        if (answers.isEmpty()) return;
        org.mozilla.geckoview.StorageController storage = GeckoEngine.runtime(activity).getStorageController();
        for (GeckoSession.PermissionDelegate.ContentPermission answer : answers) {
            storage.setPermission(answer, GeckoSession.PermissionDelegate.ContentPermission.VALUE_PROMPT);
        }
        answers.clear();
    }

    private boolean held(String[] permissions) {
        for (String name : permissions) if (activity.checkSelfPermission(name) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    /** The `SiteGrants` permission an Android permission GeckoView asks for belongs to; null for others. */
    private static String siteGrant(String android) {
        switch (android) {
            case Manifest.permission.CAMERA: return SiteGrants.CAMERA;
            case Manifest.permission.RECORD_AUDIO: return SiteGrants.MICROPHONE;
            case Manifest.permission.ACCESS_FINE_LOCATION:
            case Manifest.permission.ACCESS_COARSE_LOCATION: return SiteGrants.LOCATION;
            default: return null;
        }
    }

    private static GeckoSession.PermissionDelegate.MediaSource first(GeckoSession.PermissionDelegate.MediaSource[] sources, int kind) {
        if (sources == null) return null;
        for (GeckoSession.PermissionDelegate.MediaSource source : sources) if (source.source == kind) return source;
        return null;
    }

}
