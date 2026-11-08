package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.Menu;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
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

    private static final int MENU_HOME = 1, MENU_RELOAD = 2, MENU_WEBSITE = 3, MENU_SERVICES = 4, MENU_INFO = 5;
    /** How long history.go() may take to start moving before the native fallback runs. */
    private static final long HISTORY_FALLBACK_MS = 1000;
    private static final int BAR_DP = 56;

    private final Activity activity;
    private final Owner owner;
    private final Views views;
    private final Palette palette;
    private final FrameLayout root;
    private final ScrollView launcher;
    private final LinearLayout launcherList;
    private final FrameLayout applet, sources, foreground, splash;
    private final Views.Revealed revealed;
    private final TextView splashName, barTitle;
    private final LinearLayout bar;
    private final View menu;
    private final Map<String, Views.Page> pages = new HashMap<>();
    private Views.Page revealedPage;
    private String appletId;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private int visualState;

    Shell(Activity activity, Owner owner) {
        this.activity = activity;
        this.owner = owner;
        views = new Views(activity, this);
        palette = new Palette(activity);

        root = new FrameLayout(activity);
        root.setBackgroundColor(palette.paper);
        applyInsets(root);

        launcherList = new LinearLayout(activity);
        launcherList.setOrientation(LinearLayout.VERTICAL);
        launcherList.setPadding(dp(20), dp(24), dp(20), dp(24));
        launcher = new ScrollView(activity);
        launcher.addView(launcherList, new ScrollView.LayoutParams(-1, -2));
        root.addView(launcher, new FrameLayout.LayoutParams(-1, -1));

        applet = new FrameLayout(activity);
        sources = new FrameLayout(activity) {
            @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) { return true; }
        };
        sources.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        applet.addView(sources, new FrameLayout.LayoutParams(-1, -1));
        View barrier = new View(activity);
        barrier.setBackgroundColor(palette.paper);
        barrier.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        applet.addView(barrier, new FrameLayout.LayoutParams(-1, -1));
        foreground = new FrameLayout(activity);
        applet.addView(foreground, new FrameLayout.LayoutParams(-1, -1));
        splash = new FrameLayout(activity);
        splash.setBackgroundColor(palette.paper);
        splash.setClickable(true);
        splashName = text("", 28, palette.accent);
        splashName.setTypeface(null, Typeface.BOLD);
        splashName.setGravity(Gravity.CENTER);
        splash.addView(splashName, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));
        applet.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        // A revealed context sits below the website bar; the menu button stays on top of both.
        revealed = new Views.Revealed(activity);
        revealed.setBackgroundColor(palette.paper);
        revealed.setPadding(0, dp(BAR_DP), 0, 0);
        revealed.setVisibility(View.GONE);
        applet.addView(revealed, new FrameLayout.LayoutParams(-1, -1));
        bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(palette.paper);
        bar.setPadding(dp(16), 0, dp(60), 0);
        barTitle = text("", 17, palette.ink);
        barTitle.setTypeface(null, Typeface.BOLD);
        barTitle.setSingleLine(true);
        bar.addView(barTitle, new LinearLayout.LayoutParams(0, -2, 1));
        Button done = new Button(activity);
        done.setAllCaps(false);
        done.setText("Done");
        done.setTextColor(palette.accent);
        done.setBackground(null);
        done.setMinHeight(dp(48));
        done.setOnClickListener(v -> owner.send(Bridge.event("websiteDone")));
        bar.addView(done, new LinearLayout.LayoutParams(-2, dp(48)));
        bar.setVisibility(View.GONE);
        applet.addView(bar, new FrameLayout.LayoutParams(-1, dp(BAR_DP), Gravity.TOP));
        menu = menuButton();
        applet.addView(menu, menuLayout());
        applet.setVisibility(View.GONE);
        root.addView(applet, new FrameLayout.LayoutParams(-1, -1));

        activity.setContentView(root);
        palette.applySystemBars(activity);
    }

    /** Replaces the content with a full-screen message; used when the WebView lacks required features. */
    static void unsupported(Activity activity) {
        Palette palette = new Palette(activity);
        TextView message = new TextView(activity);
        message.setText("Genesis needs a newer Android System WebView.\n\nInstalled: " + Views.providerVersion(activity)
            + "\n\nUpdate Android System WebView from the Play Store, then reopen Genesis.");
        message.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        message.setTextColor(palette.ink);
        message.setGravity(Gravity.CENTER);
        int padding = Math.round(28 * activity.getResources().getDisplayMetrics().density);
        message.setPadding(padding, padding, padding, padding);
        message.setBackgroundColor(palette.paper);
        activity.setContentView(message);
    }

    // -----------------------------------------------------------------------------------------
    // Commands

    void showLauncher(JSONArray applets) throws JSONException {
        destroyAll();
        appletId = null;
        applet.setVisibility(View.GONE);
        launcher.setVisibility(View.VISIBLE);
        launcherList.removeAllViews();
        TextView brand = text("Genesis", 16, palette.accent);
        brand.setTypeface(null, Typeface.BOLD);
        launcherList.addView(brand);
        TextView heading = text("Apps", 32, palette.ink);
        heading.setTypeface(null, Typeface.BOLD);
        heading.setPadding(0, dp(8), 0, 0);
        launcherList.addView(heading);
        TextView subtitle = text(applets.length() == 0 ? "Your custom apps will appear here." : "Your customized apps", 16, palette.muted);
        subtitle.setPadding(0, dp(4), 0, dp(20));
        launcherList.addView(subtitle);
        for (int i = 0; i < applets.length(); i++) launcherList.addView(card(applets.getJSONObject(i)));
        owner.launcherShown();
    }

    void showApplet(String id, String name, String accent) {
        destroyAll();
        appletId = id;
        launcher.setVisibility(View.GONE);
        applet.setVisibility(View.VISIBLE);
        splashName.setText(name);
        splashName.setTextColor(palette.accent(accent));
        splash.setVisibility(View.VISIBLE);
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
        if (revealedPage == page) { barTitle.setText(title); return; }
        sources.removeView(page.web);
        page.web.setFocusable(true);
        page.web.setFocusableInTouchMode(true);
        page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        revealed.addView(page.web, new FrameLayout.LayoutParams(-1, -1));
        revealed.setVisibility(View.VISIBLE);
        barTitle.setText(title);
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
                splash.setVisibility(View.GONE);
            }
        });
    }

    boolean appletShown() { return appletId != null; }

    void showError(String message) {
        new AlertDialog.Builder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show();
    }

    void showInfo(String title, String message) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("Close", null).show();
    }

    /** An applet that cannot open, stopped pages, or a received import. A plain dialog until the designed sheet. */
    void showStatus(String kind, JSONObject entry, String details) {
        String name = entry == null ? "Applet" : entry.optString("name", "Applet");
        AlertDialog.Builder dialog = new AlertDialog.Builder(activity).setMessage(details).setNegativeButton("Close", null);
        switch (kind) {
            case "rendererLost":
                dialog.setTitle(name + " stopped");
                if (entry != null) dialog.setPositiveButton("Reload", (d, which) -> openApplet(entry.optString("appletId")));
                break;
            case "importReceived":
                dialog.setTitle(name + " received");
                break;
            default:
                dialog.setTitle(name + " can't open");
                break;
        }
        dialog.show();
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

    // -----------------------------------------------------------------------------------------
    // Pieces

    private View card(JSONObject entry) throws JSONException {
        String id = entry.getString("appletId");
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setMinimumHeight(dp(88));
        card.setPadding(dp(20), dp(16), dp(20), dp(16));
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(palette.wash);
        shape.setCornerRadius(dp(18));
        card.setBackground(shape);
        card.setClickable(true);
        card.setFocusable(true);
        TextView name = text(entry.getString("name"), 20, palette.accent(entry.optString("accent", null)));
        name.setTypeface(null, Typeface.BOLD);
        card.addView(name);
        TextView detail = text(id, 14, palette.muted);
        card.addView(detail);
        String badge = badge(entry);
        if (badge != null) {
            TextView status = text(badge, 14, palette.accent);
            status.setTypeface(null, Typeface.BOLD);
            status.setPadding(0, dp(4), 0, 0);
            card.addView(status);
        }
        card.setContentDescription(badge == null ? entry.getString("name") : entry.getString("name") + ", " + badge);
        card.setOnClickListener(v -> openApplet(id));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.bottomMargin = dp(12);
        card.setLayoutParams(layout);
        return card;
    }

    /** The launcher's status line for an applet built for another Genesis; null when it is current. */
    private static String badge(JSONObject entry) {
        if (!"incompatible".equals(entry.optString("status"))) return null;
        return "newer".equals(entry.optString("direction")) ? "Needs a newer Genesis" : "Needs update";
    }

    private void openApplet(String id) {
        try { owner.send(Bridge.event("openApplet").put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    private View menuButton() {
        ImageButton button = new ImageButton(activity);
        button.setImageResource(R.drawable.ic_nav_more);
        button.setColorFilter(palette.ink);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(palette.wash);
        button.setBackground(circle);
        button.setElevation(dp(3));
        button.setContentDescription("Genesis menu");
        button.setOnClickListener(this::openMenu);
        return button;
    }

    private FrameLayout.LayoutParams menuLayout() {
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(dp(44), dp(44), Gravity.TOP | Gravity.END);
        layout.setMargins(dp(8), dp(8), dp(8), dp(8));
        return layout;
    }

    private void openMenu(View anchor) {
        PopupMenu popup = new PopupMenu(activity, anchor);
        Menu menu = popup.getMenu();
        menu.add(Menu.NONE, MENU_HOME, 0, "Home");
        menu.add(Menu.NONE, MENU_RELOAD, 1, "Reload applet");
        menu.add(Menu.NONE, MENU_WEBSITE, 2, "View website");
        menu.add(Menu.NONE, MENU_SERVICES, 3, "Service connections");
        menu.add(Menu.NONE, MENU_INFO, 4, "Applet info");
        popup.setOnMenuItemClickListener(item -> {
            String action;
            switch (item.getItemId()) {
                case MENU_HOME: action = "home"; break;
                case MENU_RELOAD: action = "reload"; break;
                case MENU_WEBSITE: action = "viewWebsite"; break;
                case MENU_INFO: action = "info"; break;
                case MENU_SERVICES: if (appletId != null) owner.configureServices(appletId); return true;
                default: return false;
            }
            try { owner.send(Bridge.event("menu").put("action", action)); }
            catch (JSONException ignored) { /* Unreachable for string values. */ }
            return true;
        });
        popup.show();
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

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        view.setTextColor(color);
        return view;
    }

    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }

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

    /** Genesis colors for the current light or dark configuration. */
    private static final class Palette {
        final boolean dark;
        final int paper, accent, ink, wash, muted;

        Palette(Activity activity) {
            dark = (activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            paper = Color.parseColor(dark ? "#1d1b18" : "#faf7f2");
            accent = Color.parseColor(dark ? "#ff995f" : "#b93800");
            ink = Color.parseColor(dark ? "#f5eee4" : "#24211c");
            wash = Color.parseColor(dark ? "#363027" : "#f3e9dc");
            muted = Color.parseColor(dark ? "#b8ad9f" : "#6b6258");
        }

        /** The applet's accent when it is a valid color; the Genesis accent otherwise. */
        int accent(String value) {
            if (value == null || value.isEmpty()) return accent;
            try { return Color.parseColor(value); }
            catch (IllegalArgumentException error) { return accent; }
        }

        @SuppressWarnings("deprecation")
        void applySystemBars(Activity activity) {
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController controller = activity.getWindow().getInsetsController();
                if (controller == null) return;
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(dark ? 0 : light, light);
            } else if (!dark) {
                activity.getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            }
        }
    }
}
