package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import app.nirvana.genesis.ui.AddFlow;
import app.nirvana.genesis.ui.Connections;
import app.nirvana.genesis.ui.CreateApplet;
import app.nirvana.genesis.ui.GenesisMenu;
import app.nirvana.genesis.ui.Home;
import app.nirvana.genesis.ui.Manage;
import app.nirvana.genesis.ui.Notices;
import app.nirvana.genesis.ui.Review;
import app.nirvana.genesis.ui.Settings;
import app.nirvana.genesis.ui.Splash;
import app.nirvana.genesis.ui.Tokens;
import app.nirvana.genesis.ui.Ui;
import app.nirvana.genesis.ui.WebsiteBar;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The view tree: Home, the applet container (hidden contexts, foreground, splash, the revealed
 * context with its website bar, Genesis button) and the Genesis pages above both. It executes
 * commands and reports user input; it holds no applet policy.
 */
final class Shell implements Views.Listener, Ui.Actions {
    /** The activity services the shell needs. */
    interface Owner {
        void send(JSONObject event);
        void launcherShown();
        boolean chooseFiles(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback, java.util.function.BooleanSupplier valid);
        void cancelInvalidFiles();
        /** Opens the system picker for a bundle file, with its release record if the user picks one. */
        void pickAppletFile();
        Connections.Store connections();
        void storageSize(java.util.function.LongConsumer result);
        /**
         * Asks Android for these permissions, skipping those already held, and reports the granted
         * ones on the main thread, or null when the request was interrupted before the user answered.
         */
        void requestPermissions(String[] permissions, java.util.function.Consumer<Set<String>> granted);
    }

    /** How long history.go() may take to start moving before the native fallback runs. */
    private static final long HISTORY_FALLBACK_MS = 1000;

    private final Activity activity;
    private final Owner owner;
    /** The shared sign-in, and the profiles of applets that keep their own, by applet id. */
    private final SiteData sites;
    private final Map<String, SiteData> profiles = new HashMap<>();
    private final android.content.SharedPreferences state;
    private final Views views;
    private Tokens tokens;
    private final FrameLayout root;
    private final FrameLayout applet, sources, foreground;
    private final Splash splash;
    private final Views.Revealed revealed;
    /** Shows the revealed context's popup in place of the context, which keeps running behind it. */
    private final Views.PopupSheet popupSheet;
    private final WebsiteBar bar;
    private final View menu, barrier;
    private final Ui ui;
    private final Home home;
    private final AddFlow addFlow;
    private final Review review;
    private final Manage manage;
    private final Connections connections;
    private final Notices notices;
    private final Settings settings;
    private final Map<String, Views.Page> pages = new HashMap<>();
    private Views.Page revealedPage;
    /** The one window the revealed context opened, or null. */
    private Views.Page popup;
    /** The website question being asked, or null. */
    private Asking asking;
    /** Dismisses the open website sign-in prompt and cancels it, or null. */
    private Runnable cancelAuth;
    private String appletId, appletName;
    /** The user chose View website, so the next revealed context is their choice, not the applet's. */
    private boolean websiteChosen;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private int visualState;
    /** The host's progress message for flows that have no page of their own. */
    private androidx.appcompat.app.AlertDialog progress;
    private TextView progressText;

    Shell(Activity activity, Owner owner) {
        this.activity = activity;
        this.owner = owner;
        sites = SiteData.defaultProfile(activity);
        state = activity.getSharedPreferences("genesis-shell", Activity.MODE_PRIVATE);
        views = new Views(activity, this);
        tokens = new Tokens(activity);
        ui = new Ui(activity, tokens, this);
        addFlow = new AddFlow(ui);
        connections = new Connections(ui);
        manage = new Manage(ui, addFlow, connections);
        notices = new Notices(ui, addFlow);
        settings = new Settings(ui, manage::updates);
        review = new Review(ui, addFlow::finish);
        home = new Home(ui, new Home.Navigator() {
            @Override public void settings() { settings.open(); }
            @Override public void updates() { manage.updates(); }
            @Override public void info(String id) { manage.info(id); }
            @Override public void addFromRepository() { addFlow.open(null, null); }
            @Override public void control() { ui.pages.push("control", () -> Settings.control(ui), null, false); }
            @Override public void remove(String id) { manage.remove(id); }
        });

        root = new FrameLayout(activity);
        root.setBackgroundColor(tokens.surface);
        applyInsets(root);

        home.root.setVisibility(View.GONE);
        root.addView(home.root, new FrameLayout.LayoutParams(-1, -1));

        applet = new FrameLayout(activity);
        sources = new FrameLayout(activity) {
            @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) { return true; }
        };
        sources.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        applet.addView(sources, new FrameLayout.LayoutParams(-1, -1));
        barrier = new View(activity);
        barrier.setBackgroundColor(tokens.surface);
        barrier.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        applet.addView(barrier, new FrameLayout.LayoutParams(-1, -1));
        foreground = new FrameLayout(activity);
        applet.addView(foreground, new FrameLayout.LayoutParams(-1, -1));
        splash = new Splash(activity, tokens);
        applet.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        // A revealed context sits below the website bar, which grows with the font size; the Genesis button stays on top of both.
        LinearLayout website = new LinearLayout(activity);
        website.setOrientation(LinearLayout.VERTICAL);
        bar = new WebsiteBar(activity, tokens, () -> { if (!closePopup()) owner.send(Bridge.event("websiteDone")); });
        bar.setOnUpdate(manage::updates);
        bar.setVisibility(View.GONE);
        website.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        revealed = new Views.Revealed(activity);
        revealed.setBackgroundColor(tokens.surface);
        revealed.setVisibility(View.GONE);
        website.addView(revealed, new LinearLayout.LayoutParams(-1, 0, 1));
        popupSheet = new Views.PopupSheet(activity);
        popupSheet.setBackgroundColor(tokens.surface);
        popupSheet.setVisibility(View.GONE);
        website.addView(popupSheet, new LinearLayout.LayoutParams(-1, 0, 1));
        applet.addView(website, new FrameLayout.LayoutParams(-1, -1));
        menu = GenesisMenu.button(tokens, this::openMenu);
        applet.addView(menu, menuLayout());
        applet.setVisibility(View.GONE);
        root.addView(applet, new FrameLayout.LayoutParams(-1, -1));
        root.addView(ui.root(), new FrameLayout.LayoutParams(-1, -1));

        activity.setContentView(root);
        tokens.applySystemBars(activity);
    }

    /** Replaces the content with S27; used when the WebView lacks required features. */
    static void unsupported(Activity activity) {
        Tokens tokens = new Tokens(activity);
        Ui ui = new Ui(activity, tokens, null);
        FrameLayout root = new FrameLayout(activity);
        root.setBackgroundColor(tokens.surface);
        applyInsets(root);
        root.addView(Notices.webViewTooOld(ui, WebFeatures.providerVersion(activity)), new FrameLayout.LayoutParams(-1, -1));
        activity.setContentView(root);
        tokens.applySystemBars(activity);
    }

    // -----------------------------------------------------------------------------------------
    // Commands

    void showLauncher(JSONArray applets, long updatesCheckedAt) {
        destroyAll();
        deleteProfiles();
        ui.applets = applets;
        ui.updatesCheckedAt = updatesCheckedAt;
        appletId = null;
        applet.setVisibility(View.GONE);
        home.root.setVisibility(View.VISIBLE);
        home.render();
        ui.pages.refresh();
        owner.launcherShown();
    }

    /** New launcher entries while an applet is open: the menu and open pages read them. */
    void updateApplets(JSONArray applets, long updatesCheckedAt) {
        ui.applets = applets;
        ui.updatesCheckedAt = updatesCheckedAt;
        ui.pages.refresh();
    }

    /** Every URL the open applet's pages have visited, for clearing cookies set on deeper paths. */
    @Override public List<String> visitedUrls() {
        List<String> urls = new ArrayList<>();
        for (Views.Page page : pages.values()) {
            android.webkit.WebBackForwardList history = page.web.copyBackForwardList();
            for (int i = 0; i < history.getSize(); i++) urls.add(history.getItemAtIndex(i).getUrl());
        }
        return urls;
    }

    void showApplet(String id, String name, String accent) {
        destroyAll();
        ui.pages.clear();
        appletId = id;
        appletName = name;
        home.root.setVisibility(View.GONE);
        applet.setVisibility(View.VISIBLE);
        splash.show(name, accent);
    }

    void createView(JSONObject ref, String url, JSONArray origins, String startScript) throws JSONException {
        destroyView(ref);
        // The foreground is Genesis's own page and keeps the shared profile; only websites change sign-in.
        SiteData site = "foreground".equals(ref.optString("role")) ? sites : sitesFor(ref.optString("appletId"));
        Views.Page page = views.document(ref, set(origins), startScript, site);
        pages.put(key(ref), page);
        if (page.isForeground()) {
            page.web.setVisibility(View.INVISIBLE);
            foreground.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        } else {
            sources.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        }
        page.web.loadUrl(url);
    }

    void destroyView(JSONObject ref) {
        Views.Page page = pages.remove(key(ref));
        if (page == null) return;
        if (page == revealedPage) dropRevealed();
        page.destroy();
    }

    /** `replace` swaps the current history entry through the page, falling back to a push when it cannot run script. */
    void loadUrl(JSONObject ref, String url, String mode) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        if (!"replace".equals(mode)) { page.web.loadUrl(url); return; }
        String script = "(location.replace(" + JSONObject.quote(url) + "), true)";
        page.web.evaluateJavascript(script, result -> {
            if (pages.get(key(ref)) == page && !"true".equals(result)) page.web.loadUrl(url);
        });
    }

    /**
     * Moves through the context's history in the page, since WebView's own goBack() skips entries
     * left without a user gesture. If nothing starts moving within a second of the page running the
     * script, the native call runs; when it cannot move either, the host hears `historyUnmoved` so
     * a Back can fall through. The second counts from the script's callback, so a busy renderer
     * that has not run the script yet is not taken for a page that cannot move.
     */
    void historyGo(JSONObject ref, int delta) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        int moves = page.moves;
        page.web.evaluateJavascript("history.go(" + delta + ")", ran -> page.web.postDelayed(() -> {
            if (pages.get(key(ref)) != page || page.moves != moves) return;
            if (page.web.canGoBackOrForward(delta)) { page.web.goBackOrForward(delta); return; }
            try { owner.send(Bridge.event("historyUnmoved").put("view", page.ref)); }
            catch (JSONException ignored) { /* Unreachable for these values. */ }
        }, HISTORY_FALLBACK_MS));
    }

    void reload(JSONObject ref) {
        Views.Page page = pages.get(key(ref));
        if (page != null) page.web.reload();
    }

    /** Reparents the context's WebView above the foreground. Nothing reloads; the page keeps running. */
    void revealContext(JSONObject ref, String title) {
        Views.Page page = pages.get(key(ref));
        if (page == null || !page.isContext()) return;
        if (revealedPage != null && revealedPage != page) coverContext();
        if (revealedPage == page) { bar.setTitle(title); return; }
        sources.removeView(page.web);
        page.web.setFocusable(true);
        page.web.setFocusableInTouchMode(true);
        page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        revealed.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        revealed.setVisibility(View.VISIBLE);
        bar.setTitle(title);
        bar.setUrl(page.web.getUrl());
        JSONObject entry = appletId == null ? null : ui.entry(appletId);
        bar.setReason(appletName, websiteChosen, entry != null && Home.hasUpdate(entry));
        websiteChosen = false;
        bar.setVisibility(View.VISIBLE);
        GenesisMenu.tint(menu, tokens, true);
        revealedPage = page;
    }

    /**
     * Returns the revealed WebView to the hidden contexts. The page a screen reader was reading
     * disappears, so its focus moves to the menu button instead of falling to an arbitrary view.
     */
    @SuppressLint("AccessibilityFocus")
    void coverContext() {
        Views.Page page = revealedPage;
        if (page == null) return;
        closeCustomView();
        cancelPrompts();
        dropRevealed();
        stopCapture(page);
        page.web.clearFocus();
        page.web.setFocusable(false);
        page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        owner.cancelInvalidFiles();
        menu.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
    }

    /**
     * A page the user stops seeing may not keep the camera or microphone they allowed while looking
     * at it. WebView has no call that ends a page's capture, so the page reloads.
     */
    private static void stopCapture(Views.Page page) {
        if (!page.capturing) return;
        page.capturing = false;
        page.web.reload();
    }

    /** Hides the revealed container and forgets its page, leaving the WebView detached. */
    private void dropRevealed() {
        closePopup();
        if (revealedPage != null) revealed.removeView(revealedPage.web);
        revealedPage = null;
        revealed.setVisibility(View.GONE);
        bar.setVisibility(View.GONE);
        GenesisMenu.tint(menu, tokens, false);
    }

    void postMessage(JSONObject ref, String payload) {
        Views.Page page = pages.get(key(ref));
        if (page != null) page.post(payload);
    }

    /** Shows the foreground once its first frame with applet content is ready to draw. */
    void revealForeground() {
        Views.Page page = foregroundPage();
        if (page == null) return;
        page.web.postVisualStateCallback(++visualState, new android.webkit.WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                if (pages.get(key(page.ref)) != page) return;
                page.web.setVisibility(View.VISIBLE);
                splash.hide();
            }
        });
    }

    boolean appletShown() { return appletId != null; }

    /** A running flow's message; null ends it. The add flow shows its own pages; others get a dialog. */
    void showProgress(String message) {
        if (addFlow.progress(message) && message != null) return;
        if (message == null) {
            if (progress != null) progress.dismiss();
            progress = null;
            progressText = null;
            return;
        }
        if (progress != null) { progressText.setText(message); return; }
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(tokens.dp(24), tokens.dp(20), tokens.dp(24), tokens.dp(8));
        com.google.android.material.progressindicator.CircularProgressIndicator spinner =
            new com.google.android.material.progressindicator.CircularProgressIndicator(activity);
        spinner.setIndeterminate(true);
        spinner.setIndicatorColor(tokens.primary);
        row.addView(spinner, new LinearLayout.LayoutParams(-2, -2));
        progressText = tokens.text(message, Tokens.Type.BODY_LARGE, tokens.onSurface);
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(tokens.dp(16));
        row.addView(progressText, textLayout);
        progress = new MaterialAlertDialogBuilder(activity).setView(row).setCancelable(false)
            .setNegativeButton("Cancel", (d, w) -> {
                progress = null;
                progressText = null;
                owner.send(Bridge.event("cancelFlow"));
            }).show();
    }

    void showRepositoryApplets(JSONObject command) {
        dismissProgress();
        addFlow.repositoryApplets(command);
    }

    void showImportReview(JSONObject command) {
        dismissProgress();
        review.show(command);
    }

    void showInstalled(JSONObject command) {
        dismissProgress();
        addFlow.finish();
        review.installed(command);
    }

    private void dismissProgress() {
        if (progress != null) progress.dismiss();
        progress = null;
        progressText = null;
    }

    void showError(String message) {
        dismissProgress();
        if (addFlow.error(message)) return;
        new MaterialAlertDialogBuilder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show();
    }

    /** Update checks from the Updates page answer with a short toast; anything else gets a dialog. */
    void showInfo(String title, String message) {
        if ("updates".equals(ui.pages.top())) {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            return;
        }
        new MaterialAlertDialogBuilder(activity).setTitle(title).setMessage(message).setPositiveButton("Close", null).show();
    }

    /**
     * An applet that cannot open, an applet whose page stopped, or an import this Genesis cannot run.
     * `entry` is the applet's launcher entry; `details` is the host's text, used when the entry has no mismatches.
     */
    void showStatus(String kind, JSONObject entry, String details) {
        switch (kind) {
            case "rendererLost": notices.stopped(entry); break;
            case "importReceived": notices.imported(entry, details); break;
            default: notices.cantRun(entry, details); break;
        }
    }

    @Override public void openExternal(String url) {
        Intent intent = Handoff.intent(url);
        if (intent == null || !handOff(intent)) showError("No app can open " + url);
    }

    /**
     * Only the shown website downloads, since Android reports no tap for a download. The request
     * carries the site's cookies, so a signed-in file arrives instead of a sign-in page. API 26 to
     * 28 would need a storage permission for the public Downloads folder, so there the file goes
     * to Genesis's own Downloads folder.
     */
    @Override public void download(Views.Page page, String url, String userAgent, String disposition, String mimeType) {
        if (!SitePolicy.mayShowUi(page)) return;
        // A window that only started a download has nothing to show.
        if (page == popup && page.web.copyBackForwardList().getSize() == 0) bar.post(() -> { if (page == popup) closePopup(); });
        String scheme = Uri.parse(url).getScheme();
        if (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme)) {
            Toast.makeText(activity, "This download isn't supported in Genesis", Toast.LENGTH_SHORT).show();
            return;
        }
        String name = android.webkit.URLUtil.guessFileName(url, disposition, mimeType);
        // A popup counts against the page that opened it, since each download can open a new one.
        Views.Page counted = page.opener != null ? page.opener : page;
        if (counted.downloads++ == 0) { startDownload(page, url, userAgent, mimeType, name); return; }
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Download another file?")
            .setMessage(linkTitle(url) + " wants to download " + name + ".")
            .setPositiveButton("Download", (d, w) -> startDownload(page, url, userAgent, mimeType, name))
            .setNegativeButton("Cancel", null)
            .show();
    }

    /**
     * DownloadManager sends the Cookie header to every host a redirect reaches. Fetching the file in
     * the shell would scope cookies per host; until then this is a known limit.
     */
    private void startDownload(Views.Page page, String url, String userAgent, String mimeType, String name) {
        android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(Uri.parse(url))
            .setMimeType(mimeType)
            .setTitle(name)
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        String cookie = page.site.cookies(url);
        if (cookie != null) request.addRequestHeader("Cookie", cookie);
        if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
        if (Build.VERSION.SDK_INT >= 29) request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, name);
        else request.setDestinationInExternalFilesDir(activity, android.os.Environment.DIRECTORY_DOWNLOADS, name);
        try {
            ((android.app.DownloadManager) activity.getSystemService(android.content.Context.DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(activity, "Downloading " + name, Toast.LENGTH_SHORT).show();
        } catch (RuntimeException error) {
            showError("The download couldn't start: " + error.getMessage());
        }
    }

    @Override public boolean handOff(Intent intent) {
        try {
            activity.startActivity(intent);
            return true;
        } catch (RuntimeException error) {
            // A page names the target: no app, or an activity that is not exported or needs a permission.
            return false;
        }
    }

    /**
     * System Back: a fullscreen video, then the top Genesis page, then the popup's own history and
     * the popup itself. Returns whether the shell used it. The host does not track popup history,
     * so the popup's native goBack is enough.
     */
    boolean back() {
        if (closeCustomView()) return true;
        if (ui.pages.back()) return true;
        if (popup == null) return false;
        if (popup.web.canGoBack()) popup.web.goBack();
        else closePopup();
        return true;
    }

    /** Removes the popup and shows its opener again. Returns whether one was open. */
    private boolean closePopup() {
        Views.Page page = popup;
        if (page == null) return false;
        popup = null;
        closeCustomView();
        cancelPrompts();
        popupSheet.removeView(page.web);
        popupSheet.setVisibility(View.GONE);
        page.destroy();
        owner.cancelInvalidFiles();
        if (revealedPage != null) {
            revealed.setVisibility(View.VISIBLE);
            bar.setUrl(revealedPage.web.getUrl());
        }
        return true;
    }

    /** Closes a fullscreen video. Returns whether one was showing, so Back stays local to the shell. */
    boolean closeCustomView() {
        if (customView == null) return false;
        root.removeView(customView);
        customView = null;
        WebChromeClient.CustomViewCallback callback = customCallback;
        customCallback = null;
        if (callback != null) callback.onCustomViewHidden();
        return true;
    }

    void destroy() {
        destroyAll();
    }

    private void destroyAll() {
        closeCustomView();
        cancelPrompts();
        dropRevealed();
        owner.cancelInvalidFiles();
        for (Views.Page page : pages.values()) page.destroy();
        pages.clear();
    }

    // -----------------------------------------------------------------------------------------
    // View reports

    @Override public void documentStarted(Views.Page page, String url) {
        if (pages.get(key(page.ref)) != page) return;
        try { owner.send(Bridge.event("documentStarted").put("view", page.ref).put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void documentMessage(Views.Page page, String payload) {
        if (pages.get(key(page.ref)) != page) return;
        try { owner.send(Bridge.event("documentMessage").put("view", page.ref).put("payload", payload)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void contextNavigated(Views.Page page, Views.Committed committed) {
        if (pages.get(key(page.ref)) != page) return;
        if (page == revealedPage) bar.setUrl(committed.url);
        try {
            owner.send(Bridge.event("contextNavigated").put("view", page.ref).put("url", committed.url)
                .put("index", committed.index).put("size", committed.size)
                .put("canGoBack", committed.canGoBack()).put("canGoForward", committed.canGoForward())
                .put("sameDocument", committed.sameDocument).put("reload", committed.reload));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /** The dead WebView goes now; the host decides what the applet shows. A popup only closes. */
    @Override public void rendererGone(Views.Page page) {
        if (page == popup) { closePopup(); return; }
        if (pages.get(key(page.ref)) != page) return;
        pages.remove(key(page.ref));
        if (page == revealedPage) dropRevealed();
        page.destroy();
        try { owner.send(Bridge.event("rendererGone").put("view", page.ref)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void showCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        closeCustomView();
        customView = view;
        customCallback = callback;
        view.setBackgroundColor(Color.BLACK);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));
    }

    @Override public void hideCustomView() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        customCallback = null;
    }

    @Override public boolean chooseFiles(Views.Page page, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        return owner.chooseFiles(params, callback, () -> (page == popup || pages.get(key(page.ref)) == page) && SitePolicy.mayShowUi(page));
    }

    /**
     * The opener keeps running behind the sheet, so `window.opener.postMessage` still reaches it,
     * but it is no longer shown: its prompts and fullscreen video close and its capture stops.
     */
    @Override public Views.Page openWindow(Views.Page opener) {
        if (opener != revealedPage) return null;
        closePopup();
        closeCustomView();
        cancelPrompts();
        stopCapture(opener);
        popup = views.popup(opener);
        popupSheet.addView(popup.web, new FrameLayout.LayoutParams(-1, -1));
        popupSheet.setVisibility(View.VISIBLE);
        revealed.setVisibility(View.GONE);
        owner.cancelInvalidFiles();
        bar.setUrl(popup.web.getUrl());
        return popup;
    }

    /** A tapped link asks for a new window; the host decides where it goes. */
    @Override public void windowRequested(Views.Page page, String url) {
        if (page != revealedPage) return;
        try { owner.send(Bridge.event("windowRequested").put("view", page.ref).put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /**
     * No applet uses the link's website: it opens in a popup sheet over the context that asked,
     * in the same sign-in. A context the user has since left gets no sheet.
     */
    void showWindow(JSONObject ref, String url) {
        Views.Page page = pages.get(key(ref));
        if (page == null || page != revealedPage) return;
        Views.Page window = openWindow(page);
        if (window != null) window.web.loadUrl(url);
    }

    /** `window.close()` arrives inside the popup's own callback, so the view goes after it returns. */
    @Override public void closeWindow(Views.Page page) {
        bar.post(() -> { if (page == popup) closePopup(); });
    }

    @Override public void popupNavigated(Views.Page page, String url) {
        if (page == popup) bar.setUrl(url);
    }

    /** One website question: the dialog, then Android's own request. Answers once. */
    private final class Asking {
        final java.util.function.Consumer<Set<String>> result;
        android.app.Dialog dialog;
        boolean done;

        Asking(java.util.function.Consumer<Set<String>> result) { this.result = result; }

        void finish(Set<String> allowed) {
            if (done) return;
            done = true;
            if (asking == this) asking = null;
            if (dialog != null) dialog.dismiss();
            result.accept(allowed);
        }
    }

    /**
     * Genesis asks once per site and remembers the answer in `SiteGrants`; Android then asks for
     * its own permission if Genesis doesn't hold it yet. A refusal at either step refuses the site.
     * The Genesis dialog names only the permissions the site has not been answered for, and its
     * answer leaves the earlier ones as they were.
     */
    @Override public void askSite(Views.Page page, String origin, List<String> permissions, java.util.function.Consumer<Set<String>> allowed) {
        cancelPrompts();
        SiteGrants grants = page.site.grants();
        // A blocked permission stays blocked; the site still gets the others it asked for.
        List<String> open = new ArrayList<>();
        List<String> fresh = new ArrayList<>();
        for (String permission : permissions) {
            Boolean grant = grants.get(origin, permission);
            if (Boolean.FALSE.equals(grant)) continue;
            open.add(permission);
            if (grant == null) fresh.add(permission);
        }
        if (open.isEmpty()) { allowed.accept(Set.of()); return; }
        Asking ask = new Asking(allowed);
        asking = ask;
        if (fresh.isEmpty()) { askAndroid(ask, grants, origin, open); return; }
        List<String> earlier = new ArrayList<>(open);
        earlier.removeAll(fresh);
        ask.dialog = new MaterialAlertDialogBuilder(activity)
            .setTitle(Ui.host(origin) + " wants to use your " + permissionNames(fresh))
            .setMessage("Only while you're looking at it. You can reset this in Settings, Sites & sign-ins.")
            .setPositiveButton("Allow", (d, w) -> {
                for (String permission : fresh) grants.set(origin, permission, true);
                askAndroid(ask, grants, origin, open);
            })
            .setNegativeButton("Don't allow", (d, w) -> {
                for (String permission : fresh) grants.set(origin, permission, false);
                if (earlier.isEmpty()) ask.finish(Set.of());
                else askAndroid(ask, grants, origin, earlier);
            })
            .setOnCancelListener(d -> ask.finish(Set.of()))
            .show();
    }

    /**
     * Android's own request. A permission Android refuses loses its Genesis grant too, so the
     * site asks in Genesis again instead of showing an allowed grant that has no effect. When
     * Android refuses for good, it no longer asks, so Genesis points to Android's settings. An
     * interrupted request refuses this time and keeps the grants.
     */
    private void askAndroid(Asking ask, SiteGrants grants, String origin, List<String> permissions) {
        List<String> android = new ArrayList<>();
        for (String permission : permissions) for (String name : androidPermissions(permission)) android.add(name);
        owner.requestPermissions(android.toArray(new String[0]), granted -> {
            if (granted == null) { ask.finish(Set.of()); return; }
            Set<String> allowed = new LinkedHashSet<>();
            List<String> blocked = new ArrayList<>();
            for (String permission : permissions) {
                for (String name : androidPermissions(permission)) if (granted.contains(name)) { allowed.add(permission); break; }
                if (allowed.contains(permission)) continue;
                grants.forget(origin, permission);
                if (refusedForGood(permission)) blocked.add(permission);
            }
            ask.finish(allowed);
            if (!blocked.isEmpty()) showAndroidSettings(blocked);
        });
    }

    /** Android refuses without asking once the user denied a permission twice or chose "Don't ask again". */
    private boolean refusedForGood(String permission) {
        for (String name : androidPermissions(permission)) {
            if (activity.checkSelfPermission(name) == android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
            if (activity.shouldShowRequestPermissionRationale(name)) return false;
        }
        return true;
    }

    private void showAndroidSettings(List<String> permissions) {
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Android blocks Genesis from using your " + permissionNames(permissions))
            .setMessage("Allow it for Genesis in Android's settings, under Permissions.")
            .setPositiveButton("Open settings", (d, w) -> activity.startActivity(
                new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", activity.getPackageName(), null))))
            .setNegativeButton("Not now", null)
            .show();
    }

    /** The Android permissions behind a `SiteGrants` permission; any one of them is enough. */
    private static String[] androidPermissions(String permission) {
        switch (permission) {
            case SiteGrants.CAMERA: return new String[] { android.Manifest.permission.CAMERA };
            case SiteGrants.MICROPHONE: return new String[] { android.Manifest.permission.RECORD_AUDIO };
            case SiteGrants.LOCATION: return new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION };
            default: return new String[0];
        }
    }

    private static String permissionNames(List<String> permissions) {
        if (permissions.contains(SiteGrants.CAMERA) && permissions.contains(SiteGrants.MICROPHONE)) return "camera and microphone";
        return permissions.isEmpty() ? "" : permissions.get(0);
    }

    @Override public void cancelAsk() {
        if (asking != null) asking.finish(Set.of());
    }

    /** Website prompts belong to the shown website; covering or closing it answers them with a refusal. */
    private void cancelPrompts() {
        cancelAsk();
        Runnable cancel = cancelAuth;
        cancelAuth = null;
        if (cancel != null) cancel.run();
    }

    /** A server's own sign-in prompt. Genesis passes the answer on and saves nothing. */
    @Override public void httpAuth(Views.Page page, android.webkit.HttpAuthHandler handler, String host, String realm) {
        cancelPrompts();
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
        android.widget.EditText user = authField("Username", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_NORMAL);
        android.widget.EditText password = authField("Password", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(user, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams below = new LinearLayout.LayoutParams(-1, -2);
        below.topMargin = tokens.dp(12);
        form.addView(password, below);
        boolean[] answered = { false };
        Runnable cancel = () -> { if (!answered[0]) { answered[0] = true; handler.cancel(); } };
        android.app.Dialog dialog = new MaterialAlertDialogBuilder(activity)
            .setTitle("Sign in to " + host)
            .setMessage(realm == null || realm.isEmpty() ? "The website asks for a username and password." : "The website says: " + realm)
            .setView(form)
            .setPositiveButton("Sign in", (d, w) -> {
                cancelAuth = null;
                if (answered[0]) return;
                answered[0] = true;
                handler.proceed(user.getText().toString(), password.getText().toString());
            })
            .setNegativeButton("Cancel", (d, w) -> { cancelAuth = null; cancel.run(); })
            .setOnCancelListener(d -> { cancelAuth = null; cancel.run(); })
            .show();
        cancelAuth = () -> { dialog.dismiss(); cancel.run(); };
    }

    private android.widget.EditText authField(String hint, int inputType) {
        android.widget.EditText field = new android.widget.EditText(activity);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setInputType(inputType);
        tokens.style(field, Tokens.Type.BODY_LARGE, tokens.onSurface);
        field.setHintTextColor(tokens.onSurfaceVariant);
        field.setPadding(tokens.dp(14), tokens.dp(12), tokens.dp(14), tokens.dp(12));
        field.setBackground(tokens.outlined(tokens.surface, tokens.outline, 12, false));
        return field;
    }

    /**
     * The system switched between light and dark, or changed the font size. The activity keeps
     * running (the manifest handles `uiMode` and `fontScale`), so the applet and its pages survive;
     * website pages take the new text zoom and the native views the new colors.
     */
    void appearanceChanged() {
        // The font size can change without the appearance; website pages rescale either way.
        for (Views.Page page : pages.values()) WebsiteSettings.configurationChanged(page.web, page.isContext());
        if (popup != null) WebsiteSettings.configurationChanged(popup.web, true);
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        if (dark == tokens.dark) return;
        // The theme still holds the old appearance's colors; apply it again so they resolve for the new one.
        activity.getTheme().applyStyle(R.style.Theme_NirvanaGenesis, true);
        tokens = new Tokens(activity);
        ui.tokens = tokens;
        root.setBackgroundColor(tokens.surface);
        barrier.setBackgroundColor(tokens.surface);
        revealed.setBackgroundColor(tokens.surface);
        popupSheet.setBackgroundColor(tokens.surface);
        splash.restyle(tokens);
        bar.restyle(tokens);
        GenesisMenu.tint(menu, tokens, revealedPage != null);
        tokens.applySystemBars(activity);
        if (home.root.getVisibility() == View.VISIBLE) home.render();
        ui.pages.rebuildAll();
    }

    // -----------------------------------------------------------------------------------------
    // Ui.Actions

    /** Opens an applet, or the offline notice when the phone has no connection. */
    @Override public void openApplet(String id) {
        if (!online()) { notices.offline(id); return; }
        try { owner.send(Bridge.event("openApplet").put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    /**
     * Opens a website link in the applet the user picked, or asks the host which applets use its
     * site when `appletId` is null. `external` marks a link another app shared, so a Back that
     * leaves the applet returns to that app.
     */
    void openUrl(String url, String appletId, boolean external) {
        try {
            owner.send(Bridge.event("openUrl").put("url", url).put("appletId", appletId == null ? JSONObject.NULL : appletId).put("external", external));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /**
     * Every opened link asks first: one "Open in" choice per applet that uses its website, then
     * "Create a new applet". The list has only the second choice when no applet uses the site.
     * Cancel returns to the app that shared the link.
     */
    void chooseApplet(String url, JSONArray applets, boolean external) {
        int count = applets.length();
        String[] choices = new String[count + 1];
        String[] ids = new String[count];
        for (int i = 0; i < count; i++) {
            JSONObject entry = applets.optJSONObject(i);
            ids[i] = entry == null ? "" : entry.optString("appletId");
            choices[i] = "Open in " + (entry == null ? ids[i] : entry.optString("name", ids[i]));
        }
        choices[count] = "Create a new applet";
        new MaterialAlertDialogBuilder(activity)
            .setTitle(linkTitle(url))
            .setItems(choices, (d, which) -> {
                if (which < count) openUrl(url, ids[which], external);
                else ui.pages.push(CreateApplet.TAG, () -> CreateApplet.page(ui, url), null, false);
            })
            .setNegativeButton("Cancel", (d, which) -> leaveFor(external))
            .setOnCancelListener(d -> leaveFor(external))
            .show();
    }

    /** A cancelled chooser for a link another app shared returns to that app, as Back would. */
    private void leaveFor(boolean external) {
        if (external) activity.moveTaskToBack(true);
    }

    /** The chooser's title: the link's host, or the link itself when it has none. */
    private static String linkTitle(String url) {
        String host = Uri.parse(url).getHost();
        return host == null || host.isEmpty() ? url : host;
    }

    /** "Open a link": a URL field, prefilled when the clipboard holds a website link. */
    @Override public void openLink() {
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
        android.widget.EditText field = authField("https://…", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        String copied = clipboardLink();
        if (copied != null) field.setText(copied);
        form.addView(field, new LinearLayout.LayoutParams(-1, -2));
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Open a link")
            .setMessage("Choose the applet that opens it, or create a new one.")
            .setView(form)
            .setPositiveButton("Open", (d, w) -> {
                String url = field.getText().toString().trim();
                if (!url.isEmpty()) openUrl(url, null, false);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private String clipboardLink() {
        android.content.ClipboardManager clipboard = activity.getSystemService(android.content.ClipboardManager.class);
        android.content.ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).getText();
        String value = text == null ? "" : text.toString().trim();
        return value.matches("(?i)https?://\\S+") ? value : null;
    }

    @Override public void addFromRepository(String input) {
        try { owner.send(Bridge.event("addFromRepository").put("input", input)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void pickFile() { owner.pickAppletFile(); }

    @Override public void chooseCandidate(String id, String version) {
        try { owner.send(Bridge.event("chooseCandidate").put("appletId", id).put("version", version == null ? JSONObject.NULL : version)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void cancelFlow() { owner.send(Bridge.event("cancelFlow")); }

    @Override public void reviewDecision(String reviewId, boolean accept, String replace) {
        try {
            owner.send(Bridge.event("reviewDecision").put("reviewId", reviewId).put("accept", accept)
                .put("replace", replace == null ? JSONObject.NULL : replace));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void checkUpdates(String id, boolean manual) {
        try { owner.send(Bridge.event("checkUpdates").put("appletId", id == null ? JSONObject.NULL : id).put("manual", manual)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void removeApplet(String id) { appletEvent("removeApplet", id); }

    @Override public void clearData(String id) { appletEvent("clearData", id); }

    @Override public void keepVersion(String id) { appletEvent("keepVersion", id); }

    @Override public void menu(String action) {
        try { owner.send(Bridge.event("menu").put("action", action)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public Connections.Store connections() { return owner.connections(); }

    @Override public SiteData sites() { return sites; }

    // -----------------------------------------------------------------------------------------
    // Separate sign-ins

    private static final String DELETE_PROFILES = "deleteProfiles";

    private static String profileKey(String appletId) { return "profile:" + appletId; }

    private static String profileNameKey(String appletId) { return "profileName:" + appletId; }

    /** Each time the switch turns on the applet gets a new profile, so an old one that is still being deleted is never reused. */
    private String profileName(String appletId) { return state.getString(profileNameKey(appletId), "applet-" + appletId); }

    /** The applet's own profile when it keeps a separate sign-in, otherwise the shared one. */
    @Override public SiteData sitesFor(String appletId) {
        if (appletId == null || !separateSignIn(appletId)) return sites;
        return profiles.computeIfAbsent(appletId, id -> SiteData.profile(activity, profileName(id)));
    }

    @Override public boolean separateSignInAvailable() { return SiteData.profilesSupported(); }

    @Override public boolean separateSignIn(String appletId) {
        return SiteData.profilesSupported() && state.getBoolean(profileKey(appletId), false);
    }

    /**
     * Turning it on starts the applet signed out in a new profile; turning it off returns it to the
     * shared sign-in and deletes its profile once no WebView uses it. An open applet reopens.
     */
    @Override public void setSeparateSignIn(String appletId, boolean on) {
        if (on == separateSignIn(appletId)) return;
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        if (on) {
            String name = "applet-" + appletId + "-" + Long.toString(System.currentTimeMillis(), 36);
            state.edit().putBoolean(profileKey(appletId), true).putString(profileNameKey(appletId), name).apply();
        } else {
            pending.add(profileName(appletId));
            state.edit().remove(profileKey(appletId)).remove(profileNameKey(appletId)).putStringSet(DELETE_PROFILES, pending).apply();
        }
        profiles.remove(appletId);
        if (appletId.equals(this.appletId)) openApplet(appletId);
        ui.pages.refresh();
    }

    /** A removed or erased applet's separate sign-in goes with it. */
    void forgetProfile(String appletId) {
        if (!state.getBoolean(profileKey(appletId), false)) return;
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        pending.add(profileName(appletId));
        state.edit().remove(profileKey(appletId)).remove(profileNameKey(appletId)).putStringSet(DELETE_PROFILES, pending).apply();
        profiles.remove(appletId);
    }

    /** Deletes the profiles waiting for deletion; one a WebView still holds waits for the next launcher. */
    private void deleteProfiles() {
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        if (pending.isEmpty()) return;
        pending.removeIf(name -> SiteData.delete(activity, name));
        state.edit().putStringSet(DELETE_PROFILES, pending).apply();
    }

    @Override public void storageSize(java.util.function.LongConsumer result) { owner.storageSize(result); }

    private void appletEvent(String type, String id) {
        try { owner.send(Bridge.event(type).put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @SuppressWarnings("deprecation")
    private boolean online() {
        ConnectivityManager manager = activity.getSystemService(ConnectivityManager.class);
        if (manager == null) return true;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    // -----------------------------------------------------------------------------------------
    // The Genesis button and menu

    /** Top end, 6 dp from the edges, inside the website bar's free end while a website shows. */
    private FrameLayout.LayoutParams menuLayout() {
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(tokens.dp(48), tokens.dp(48), Gravity.TOP | Gravity.END);
        layout.setMargins(tokens.dp(6), tokens.dp(8), tokens.dp(6), tokens.dp(6));
        return layout;
    }

    private void openMenu() {
        if (appletId == null) return;
        String url = revealedPage != null ? revealedUrl() : contextUrl();
        GenesisMenu.show(ui, appletName == null ? appletId : appletName, ui.entry(appletId), url, revealedPage != null, this::menuAction);
    }

    private void menuAction(GenesisMenu.Action action) {
        switch (action) {
            case HOME: menu("home"); return;
            case RELOAD: menu("reload"); return;
            case VIEW_WEBSITE: websiteChosen = true; menu("viewWebsite"); return;
            case INFO: if (appletId != null) manage.info(appletId); return;
            case SERVICES: if (appletId != null) connections.open(appletId); return;
            case OPEN_IN_BROWSER: { String url = revealedUrl(); if (url != null) openExternal(url); return; }
            case COPY_LINK: { String url = revealedUrl(); if (url != null) tokens.copy("Link", url); return; }
            default:
        }
    }

    /** The URL of the applet's first website context, shown in the menu over the applet's own screens. */
    private String contextUrl() {
        for (Views.Page page : pages.values()) if (page.isContext() && page.web.getUrl() != null) return page.web.getUrl();
        return null;
    }

    /** What the user sees: the popup while one is open, otherwise the revealed context. */
    private String revealedUrl() {
        if (popup != null) return popup.web.getUrl();
        return revealedPage == null ? null : revealedPage.web.getUrl();
    }

    private Views.Page foregroundPage() {
        for (Views.Page page : pages.values()) if (page.isForeground()) return page;
        return null;
    }

    private static String key(JSONObject ref) { return ref.optString("appletId") + "\n" + ref.optString("role"); }

    private static Set<String> set(JSONArray values) throws JSONException {
        Set<String> result = new LinkedHashSet<>();
        for (int i = 0; i < values.length(); i++) result.add(values.getString(i));
        return result;
    }

    @SuppressWarnings("deprecation")
    private static void applyInsets(View view) {
        view.setOnApplyWindowInsetsListener((target, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                target.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            }
            target.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
    }
}
