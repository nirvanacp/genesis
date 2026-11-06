package app.nirvana.genesis;

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
 * The view tree: launcher, applet container (hidden sources, foreground, splash, Genesis menu),
 * website sheet and dialogs. It executes commands and reports user input; it holds no applet policy.
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

    private final Activity activity;
    private final Owner owner;
    private final Views views;
    private final Palette palette;
    private final FrameLayout root;
    private final ScrollView launcher;
    private final LinearLayout launcherList;
    private final FrameLayout applet, sources, foreground, splash, sheetContent;
    private final TextView splashName, sheetTitle;
    private final LinearLayout sheet;
    private final Map<String, Views.Page> pages = new HashMap<>();
    private Views.Page website;
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
        applet.addView(menuButton(), menuLayout());
        applet.setVisibility(View.GONE);
        root.addView(applet, new FrameLayout.LayoutParams(-1, -1));

        sheet = new LinearLayout(activity);
        sheet.setOrientation(LinearLayout.VERTICAL);
        sheet.setBackgroundColor(palette.paper);
        sheet.setClickable(true);
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), 0, dp(8), 0);
        sheetTitle = text("", 17, palette.ink);
        sheetTitle.setTypeface(null, Typeface.BOLD);
        sheetTitle.setSingleLine(true);
        bar.addView(sheetTitle, new LinearLayout.LayoutParams(0, -2, 1));
        Button back = new Button(activity);
        back.setAllCaps(false);
        back.setText("Return to applet");
        back.setTextColor(palette.accent);
        back.setBackground(null);
        back.setMinHeight(dp(48));
        back.setOnClickListener(v -> owner.send(Bridge.event("websiteReturn")));
        bar.addView(back, new LinearLayout.LayoutParams(-2, dp(48)));
        sheet.addView(bar, new LinearLayout.LayoutParams(-1, dp(56)));
        sheetContent = new FrameLayout(activity);
        sheet.addView(sheetContent, new LinearLayout.LayoutParams(-1, 0, 1));
        sheet.setVisibility(View.GONE);
        root.addView(sheet, new FrameLayout.LayoutParams(-1, -1));

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
        if (page != null) page.destroy();
    }

    void loadUrl(JSONObject ref, String url) {
        Views.Page page = pages.get(key(ref));
        if (page != null) page.web.loadUrl(url);
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

    void showWebsite(String url, String title, JSONArray origins) throws JSONException {
        sheetTitle.setText(title);
        if (website == null) {
            JSONObject ref = new JSONObject().put("appletId", appletId == null ? "" : appletId).put("role", "website");
            website = views.website(ref, set(origins));
            sheetContent.addView(website.web, new FrameLayout.LayoutParams(-1, -1));
        } else {
            website.origins.clear();
            website.origins.addAll(set(origins));
        }
        sheet.setVisibility(View.VISIBLE);
        website.web.loadUrl(url);
    }

    void hideWebsite() {
        closeCustomView();
        sheet.setVisibility(View.GONE);
        if (website != null) website.destroy();
        website = null;
        owner.cancelInvalidFiles();
    }

    void websiteBack() {
        if (website != null && website.web.canGoBack()) website.web.goBack();
    }

    boolean websiteCanGoBack() { return website != null && website.web.canGoBack(); }

    boolean appletShown() { return appletId != null; }

    void showError(String message) {
        new AlertDialog.Builder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show();
    }

    void showInfo(String title, String message) {
        new AlertDialog.Builder(activity).setTitle(title).setMessage(message).setPositiveButton("Close", null).show();
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
        hideWebsite();
        for (Views.Page page : pages.values()) page.destroy();
        pages.clear();
    }

    // -----------------------------------------------------------------------------------------
    // View reports

    @Override public void documentLoaded(Views.Page page, String url) {
        if (pages.get(key(page.ref)) != page) return;
        try { owner.send(Bridge.event("documentLoaded").put("view", page.ref).put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void documentMessage(Views.Page page, String payload) {
        if (pages.get(key(page.ref)) != page) return;
        try { owner.send(Bridge.event("documentMessage").put("view", page.ref).put("payload", payload)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void websiteUrlChanged(String url) {
        try { owner.send(Bridge.event("websiteUrlChanged").put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void rendererGone(Views.Page page) {
        if (page == website) hideWebsite();
        else if (pages.remove(key(page.ref)) == page) page.destroy();
        showError("A page of this applet stopped. Choose Reload applet in the Genesis menu.");
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
        return owner.chooseFiles(params, callback, () -> website == page);
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
        card.setContentDescription(entry.getString("name"));
        card.setOnClickListener(v -> {
            try { owner.send(Bridge.event("openApplet").put("appletId", id)); }
            catch (JSONException ignored) { /* Unreachable for string values. */ }
        });
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.bottomMargin = dp(12);
        card.setLayoutParams(layout);
        return card;
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
        menu.add(Menu.NONE, MENU_WEBSITE, 2, "Open website");
        menu.add(Menu.NONE, MENU_SERVICES, 3, "Service connections");
        menu.add(Menu.NONE, MENU_INFO, 4, "Applet info");
        popup.setOnMenuItemClickListener(item -> {
            String action;
            switch (item.getItemId()) {
                case MENU_HOME: action = "home"; break;
                case MENU_RELOAD: action = "reload"; break;
                case MENU_WEBSITE: action = "openWebsite"; break;
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
