package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
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
    }

    /** How long history.go() may take to start moving before the native fallback runs. */
    private static final long HISTORY_FALLBACK_MS = 1000;

    private final Activity activity;
    private final Owner owner;
    private final SiteData sites = SiteData.defaultProfile();
    private final Views views;
    private Tokens tokens;
    private final FrameLayout root;
    private final FrameLayout applet, sources, foreground;
    private final Splash splash;
    private final Views.Revealed revealed;
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
        views = new Views(activity, this, sites);
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
        bar = new WebsiteBar(activity, tokens, () -> owner.send(Bridge.event("websiteDone")));
        bar.setOnUpdate(manage::updates);
        bar.setVisibility(View.GONE);
        website.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        revealed = new Views.Revealed(activity);
        revealed.setBackgroundColor(tokens.surface);
        revealed.setVisibility(View.GONE);
        website.addView(revealed, new LinearLayout.LayoutParams(-1, 0, 1));
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
        Views.Page page = views.document(ref, set(origins), startScript);
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
        dropRevealed();
        page.web.clearFocus();
        page.web.setFocusable(false);
        page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        owner.cancelInvalidFiles();
        menu.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
    }

    /** Hides the revealed container and forgets its page, leaving the WebView detached. */
    private void dropRevealed() {
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
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            showError("No app can open " + url);
        }
    }

    /** System Back: a fullscreen video, then the top Genesis page. Returns whether the shell used it. */
    boolean back() {
        if (closeCustomView()) return true;
        return ui.pages.back();
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

    /** The dead WebView goes now; the host decides what the applet shows. */
    @Override public void rendererGone(Views.Page page) {
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
        return owner.chooseFiles(params, callback, () -> pages.get(key(page.ref)) == page && SitePolicy.mayShowUi(page));
    }

    /**
     * The system switched between light and dark, or changed the font size. The activity keeps
     * running (the manifest handles `uiMode` and `fontScale`), so the applet and its pages survive;
     * website pages take the new text zoom and the native views the new colors.
     */
    void appearanceChanged() {
        // The font size can change without the appearance; website pages rescale either way.
        for (Views.Page page : pages.values()) WebsiteSettings.configurationChanged(page.web, page.isContext());
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
        String url = revealedPage != null ? revealedPage.web.getUrl() : contextUrl();
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

    private String revealedUrl() { return revealedPage == null ? null : revealedPage.web.getUrl(); }

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
