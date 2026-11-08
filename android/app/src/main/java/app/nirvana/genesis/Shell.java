package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.nirvana.genesis.ui.GenesisMenu;
import app.nirvana.genesis.ui.Launcher;
import app.nirvana.genesis.ui.Splash;
import app.nirvana.genesis.ui.StatusSheet;
import app.nirvana.genesis.ui.Tokens;
import app.nirvana.genesis.ui.WebsiteBar;
import com.google.android.material.color.DynamicColors;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The view tree: launcher, applet container (hidden contexts, foreground, splash, the revealed
 * context with its website bar, Genesis menu) and dialogs. It executes commands and reports user
 * input; it holds no applet policy.
 */
final class Shell implements Views.Listener {
    /** The activity services the shell needs. */
    interface Owner {
        void send(JSONObject event);
        void configureServices(String appletId);
        void launcherShown();
        boolean chooseFiles(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback, java.util.function.BooleanSupplier valid);
        void cancelInvalidFiles();
    }

    /** How long history.go() may take to start moving before the native fallback runs. */
    private static final long HISTORY_FALLBACK_MS = 1000;

    private final Activity activity;
    private final Owner owner;
    private final Views views;
    private Tokens tokens;
    private final FrameLayout root;
    private final ScrollView launcher;
    private final FrameLayout applet, sources, foreground;
    private final Splash splash;
    private final Views.Revealed revealed;
    private final WebsiteBar bar;
    private final View menu, barrier;
    private ImageView menuFace;
    private JSONArray launcherApplets;
    private final Map<String, Views.Page> pages = new HashMap<>();
    private Views.Page revealedPage;
    private String appletId, appletName;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private int visualState;

    Shell(Activity activity, Owner owner) {
        this.activity = activity;
        this.owner = owner;
        DynamicColors.applyToActivityIfAvailable(activity);
        views = new Views(activity, this);
        tokens = new Tokens(activity);

        root = new FrameLayout(activity);
        root.setBackgroundColor(tokens.surface);
        applyInsets(root);

        launcher = new ScrollView(activity);
        root.addView(launcher, new FrameLayout.LayoutParams(-1, -1));

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
        // A revealed context sits below the website bar, which grows with the font size; the menu button stays on top of both.
        LinearLayout website = new LinearLayout(activity);
        website.setOrientation(LinearLayout.VERTICAL);
        bar = new WebsiteBar(activity, tokens, () -> owner.send(Bridge.event("websiteDone")));
        bar.setVisibility(View.GONE);
        website.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        revealed = new Views.Revealed(activity);
        revealed.setBackgroundColor(tokens.surface);
        revealed.setVisibility(View.GONE);
        website.addView(revealed, new LinearLayout.LayoutParams(-1, 0, 1));
        applet.addView(website, new FrameLayout.LayoutParams(-1, -1));
        menu = menuButton();
        applet.addView(menu, menuLayout());
        applet.setVisibility(View.GONE);
        root.addView(applet, new FrameLayout.LayoutParams(-1, -1));

        activity.setContentView(root);
        tokens.applySystemBars(activity);
    }

    /** Replaces the content with a full-screen message; used when the WebView lacks required features. */
    static void unsupported(Activity activity) {
        DynamicColors.applyToActivityIfAvailable(activity);
        Tokens tokens = new Tokens(activity);
        TextView message = tokens.text("Genesis needs a newer Android System WebView.\n\nInstalled: " + Views.providerVersion(activity)
            + "\n\nUpdate Android System WebView from the Play Store, then reopen Genesis.", Tokens.Type.BODY_LARGE, tokens.onSurface);
        message.setGravity(Gravity.CENTER);
        message.setPadding(tokens.dp(28), tokens.dp(28), tokens.dp(28), tokens.dp(28));
        message.setBackgroundColor(tokens.surface);
        activity.setContentView(message);
        tokens.applySystemBars(activity);
    }

    // -----------------------------------------------------------------------------------------
    // Commands

    void showLauncher(JSONArray applets) throws JSONException {
        destroyAll();
        launcherApplets = applets;
        appletId = null;
        applet.setVisibility(View.GONE);
        launcher.setVisibility(View.VISIBLE);
        launcher.removeAllViews();
        launcher.addView(new Launcher(activity, tokens, this::openApplet).build(applets), new ScrollView.LayoutParams(-1, -2));
        owner.launcherShown();
    }

    void showApplet(String id, String name, String accent) {
        destroyAll();
        appletId = id;
        appletName = name;
        launcher.setVisibility(View.GONE);
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
     * left without a user gesture. If nothing starts moving within a second, the native call runs.
     */
    void historyGo(JSONObject ref, int delta) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        int moves = page.moves;
        page.web.evaluateJavascript("history.go(" + delta + ")", null);
        page.web.postDelayed(() -> {
            if (pages.get(key(ref)) != page || page.moves != moves) return;
            if (page.web.canGoBackOrForward(delta)) page.web.goBackOrForward(delta);
        }, HISTORY_FALLBACK_MS);
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
        bar.setVisibility(View.VISIBLE);
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

    void showError(String message) {
        new MaterialAlertDialogBuilder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show();
    }

    void showInfo(String title, String message) {
        new MaterialAlertDialogBuilder(activity).setTitle(title).setMessage(message).setPositiveButton("Close", null).show();
    }

    /**
     * An applet that cannot open, an applet whose page stopped, or an import this Genesis cannot run.
     * `entry` is the applet's launcher entry; `details` is the host's text, used when the entry has no mismatches.
     */
    void showStatus(String kind, JSONObject entry, String details) {
        switch (kind) {
            case "rendererLost":
                String name = entry == null ? "Applet" : entry.optString("name", "Applet");
                StatusSheet.rendererLost(activity, tokens, name, entry == null ? null : () -> openApplet(entry.optString("appletId")));
                break;
            case "importReceived":
                StatusSheet.importNotice(root, activity, tokens, entry, details);
                break;
            default:
                StatusSheet.incompatible(activity, tokens, entry, details);
                break;
        }
    }

    @Override public void openExternal(String url) {
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException error) {
            showError("No app can open " + url);
        }
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
        return owner.chooseFiles(params, callback, () -> pages.get(key(page.ref)) == page && page.isRevealed());
    }

    /**
     * The system switched between light and dark. The activity keeps running (the manifest handles
     * `uiMode`), so the applet and its pages survive; only the native views take the new colors.
     */
    void appearanceChanged() {
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        if (dark == tokens.dark) return;
        // The theme still holds the old appearance's colors; apply it again so they resolve for the new one.
        activity.getTheme().applyStyle(R.style.Theme_NirvanaGenesis, true);
        DynamicColors.applyToActivityIfAvailable(activity);
        tokens = new Tokens(activity);
        root.setBackgroundColor(tokens.surface);
        barrier.setBackgroundColor(tokens.surface);
        revealed.setBackgroundColor(tokens.surface);
        splash.restyle(tokens);
        bar.restyle(tokens);
        styleMenuFace();
        tokens.applySystemBars(activity);
        if (launcher.getVisibility() == View.VISIBLE && launcherApplets != null) {
            launcher.removeAllViews();
            launcher.addView(new Launcher(activity, tokens, this::openApplet).build(launcherApplets), new ScrollView.LayoutParams(-1, -2));
        }
    }

    // -----------------------------------------------------------------------------------------
    // Pieces

    private void openApplet(String id) {
        try { owner.send(Bridge.event("openApplet").put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    /** The Genesis button: a 44 dp tonal square with 12 dp corners inside a 48 dp touch target. */
    private View menuButton() {
        FrameLayout target = new FrameLayout(activity);
        target.setClickable(true);
        target.setFocusable(true);
        target.setContentDescription("Genesis menu");
        target.setOnClickListener(v -> openMenu());
        menuFace = tokens.icon(R.drawable.ic_nav_more, tokens.onSecondaryContainer);
        menuFace.setScaleType(ImageView.ScaleType.CENTER);
        menuFace.setElevation(tokens.dp(3));
        menuFace.setDuplicateParentStateEnabled(true);
        styleMenuFace();
        target.addView(menuFace, new FrameLayout.LayoutParams(tokens.dp(44), tokens.dp(44), Gravity.CENTER));
        return target;
    }

    private void styleMenuFace() {
        menuFace.setImageTintList(android.content.res.ColorStateList.valueOf(tokens.onSecondaryContainer));
        menuFace.setBackground(tokens.pressable(tokens.secondaryContainer, 12, 12));
    }

    /** Top end, with the visible button 8 dp from the edges. */
    private FrameLayout.LayoutParams menuLayout() {
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(tokens.dp(48), tokens.dp(48), Gravity.TOP | Gravity.END);
        layout.setMargins(tokens.dp(6), tokens.dp(6), tokens.dp(6), tokens.dp(6));
        return layout;
    }

    private void openMenu() {
        if (appletId == null) return;
        GenesisMenu.show(activity, tokens, appletName == null ? appletId : appletName, appletId, revealedPage != null, this::menuAction);
    }

    private void menuAction(GenesisMenu.Action action) {
        String event;
        switch (action) {
            case HOME: event = "home"; break;
            case RELOAD: event = "reload"; break;
            case VIEW_WEBSITE: event = "viewWebsite"; break;
            case INFO: event = "info"; break;
            case SERVICES: if (appletId != null) owner.configureServices(appletId); return;
            case OPEN_IN_BROWSER: { String url = revealedUrl(); if (url != null) openExternal(url); return; }
            case COPY_LINK: { String url = revealedUrl(); if (url != null) tokens.copy("Link", url); return; }
            default: return;
        }
        try { owner.send(Bridge.event("menu").put("action", event)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
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
