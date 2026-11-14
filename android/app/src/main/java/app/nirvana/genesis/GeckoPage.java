package app.nirvana.genesis;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
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
 * document, then `contextNavigated` with the session history's index and size.
 */
final class GeckoPage implements WebsitePage {
    /** How long a page that took a link click has to start moving before the URL loads anyway. */
    private static final long LINK_FALLBACK_MS = 1000;

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

    private GeckoPage(Activity activity, Views.Listener listener, Views.Page page, String startScript) {
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
        view = new GeckoView(activity);
        session.open(GeckoEngine.runtime(activity));
        view.setSession(session);
        // Hidden contexts keep running, as they do in WebView; only the revealed one has focus.
        session.setActive(true);
        session.setFocused(false);
        GeckoEngine.extension(activity, extension -> {
            if (destroyed) return;
            session.getWebExtensionController().setMessageDelegate(extension, new Bridge(), "genesis");
            List<Runnable> loads = waiting;
            waiting = null;
            for (Runnable load : loads) load.run();
        });
    }

    /** A context view. Its bridge and start script apply on the page's declared origins only. */
    static GeckoPage document(Activity activity, Views.Listener listener, Views.Page page, String startScript) {
        GeckoPage tab = new GeckoPage(activity, listener, page, startScript);
        tab.view.setFocusable(false);
        tab.view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return tab;
    }

    /** Runs a load now, or once the bridge extension is ready. */
    private void whenReady(Runnable load) {
        if (waiting != null) waiting.add(load);
        else if (!destroyed) load.run();
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

    @Override public void input(JSONArray events) throws Input.Refused { Input.dispatch(view, events); }

    @Override public void setRevealed(boolean revealed) { session.setFocused(revealed); }

    /** The runtime follows Android's font size and appearance for every page. */
    @Override public void configurationChanged() {}

    @Override public void destroy() {
        destroyed = true;
        main.removeCallbacksAndMessages(null);
        port = null;
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
        listener.contextNavigated(page, committed);
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
                if (bound && message.has("data")) listener.documentMessage(page, message.optString("data"));
            }
            case "followed" -> {
                if (message.optInt("id") != followed || following == null) return;
                Consumer<Boolean> result = following;
                following = null;
                result.accept(message.optBoolean("taken"));
            }
            default -> { /* An older content script's message; nothing to do. */ }
        }
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
         * revealed page may hand it over, and only from a tap, as in WebView. New windows open in
         * place until popups have their own sheet.
         */
        @Override public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, LoadRequest request) {
            String scheme = android.net.Uri.parse(request.uri).getScheme();
            if ("https".equals(scheme) || "http".equals(scheme)) {
                if (request.target == TARGET_WINDOW_NEW) return GeckoResult.fromValue(AllowOrDeny.DENY);
                return GeckoResult.fromValue(AllowOrDeny.ALLOW);
            }
            if ("about".equals(scheme) || "data".equals(scheme) || "blob".equals(scheme)) return GeckoResult.fromValue(AllowOrDeny.ALLOW);
            if (!SitePolicy.mayHandOff(page, SitePolicy.usersGesture(page, request.hasUserGesture))) return GeckoResult.fromValue(AllowOrDeny.DENY);
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
    }

}
