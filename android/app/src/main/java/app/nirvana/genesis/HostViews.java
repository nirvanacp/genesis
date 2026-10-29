package app.nirvana.genesis;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.Menu;
import android.view.SubMenu;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageButton;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.ProgressBar;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Native Apps launcher and floating host controls, independent of creator UI. */
final class HostViews {
    interface Events { void send(JSONObject event); }
    final FrameLayout browserSlot;
    private final Activity activity;
    private final int paper, ink, wash;
    private final Events events;
    private final FrameLayout content;
    private final ScrollView cover;
    private final TextView coverTitle, coverMessage;
    private final LinearLayout recovery;
    private final LinearLayout siteRecovery;
    private final ImageButton floatingMenu;
    private final LinearLayout readerBar;
    private final TextView readerOrigin;
    private final Button readerBack, readerForward;
    private final ProgressBar pageProgress;
    private String readerUrl = "";
    private PopupMenu activeMenu;
    private JSONArray actions = new JSONArray();
    private String presentationState = "loading", presentationMessage = "";
    private boolean fullscreen;
    private boolean readerVisible;

    @SuppressWarnings("deprecation")
    HostViews(Activity activity, Events events) {
        this.activity = activity; this.events = events;
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        paper = Color.parseColor(dark ? "#1d1b18" : "#faf7f2");
        ink = Color.parseColor(dark ? "#f5eee4" : "#24211c");
        wash = Color.parseColor(dark ? "#363027" : "#f3e9dc");
        content = new FrameLayout(activity); content.setBackgroundColor(paper);
        content.setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        browserSlot = new FrameLayout(activity); content.addView(browserSlot, new FrameLayout.LayoutParams(-1, -1));

        readerBar = new LinearLayout(activity); readerBar.setGravity(Gravity.CENTER_VERTICAL);
        readerBar.setPadding(dp(8), 0, dp(8), 0); readerBar.setBackgroundColor(paper);
        readerBack = button("‹", () -> events.send(event("back")));
        readerBack.setContentDescription("Back"); readerBack.setMinWidth(dp(48));
        readerForward = button("›", () -> events.send(event("forward")));
        readerForward.setContentDescription("Forward"); readerForward.setMinWidth(dp(48));
        Button close = button("×", () -> events.send(event("readerClose")));
        close.setContentDescription("Close reader"); close.setMinWidth(dp(48));
        readerOrigin = text("", 14); readerOrigin.setSingleLine(true); readerOrigin.setEllipsize(android.text.TextUtils.TruncateAt.END);
        readerBar.addView(readerBack, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.addView(readerForward, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.addView(readerOrigin, new LinearLayout.LayoutParams(0, -2, 1));
        readerBar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        Button more = button("⋮", () -> readerMenu()); more.setContentDescription("Reader options");
        readerBar.addView(more, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.setVisibility(View.GONE);
        content.addView(readerBar, new FrameLayout.LayoutParams(-1, dp(52), Gravity.TOP));
        pageProgress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100); pageProgress.setIndeterminate(true); pageProgress.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP);
        content.addView(pageProgress, progressLayout);

        LinearLayout notice = new LinearLayout(activity); notice.setOrientation(LinearLayout.VERTICAL);
        notice.setGravity(Gravity.CENTER); notice.setPadding(dp(28), dp(28), dp(28), dp(88));
        coverTitle = text("", 24); coverTitle.setTypeface(null, Typeface.BOLD); coverTitle.setGravity(Gravity.CENTER);
        coverMessage = text("", 16); coverMessage.setGravity(Gravity.CENTER); coverMessage.setPadding(0, dp(12), 0, dp(20));
        coverMessage.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        notice.addView(coverTitle); notice.addView(coverMessage);
        recovery = new LinearLayout(activity); recovery.setOrientation(LinearLayout.VERTICAL);
        recovery.addView(button("Retry customization", () -> events.send(event("retry"))));
        recovery.addView(button("Open ordinary site", () -> events.send(event("ordinary"))));
        recovery.addView(button("Return to Apps", () -> events.send(event("home"))));
        notice.addView(recovery);
        siteRecovery = new LinearLayout(activity); siteRecovery.setOrientation(LinearLayout.VERTICAL);
        siteRecovery.addView(button("Retry page", () -> events.send(event("reload"))));
        siteRecovery.addView(button("Back", () -> events.send(event("back"))));
        siteRecovery.addView(button("Open in browser", () -> events.send(event("openBrowser"))));
        notice.addView(siteRecovery); siteRecovery.setVisibility(View.GONE);
        cover = new ScrollView(activity); cover.setFillViewport(true); cover.setBackgroundColor(paper);
        cover.addView(notice, new ScrollView.LayoutParams(-1, -2)); cover.setVisibility(View.GONE);
        content.addView(cover, new FrameLayout.LayoutParams(-1, -1));

        floatingMenu = new ImageButton(activity);
        floatingMenu.setImageResource(R.drawable.ic_genesis_plus);
        floatingMenu.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        floatingMenu.setContentDescription("Genesis menu"); floatingMenu.setTooltipText("Genesis menu");
        floatingMenu.setPadding(0, 0, 0, 0); floatingMenu.setElevation(dp(4));
        floatingMenu.setBackgroundTintList(null);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(Color.rgb(140, 21, 21));
        floatingMenu.setBackground(new RippleDrawable(ColorStateList.valueOf(0x40ffffff), circle, null));
        floatingMenu.setOnClickListener(view -> menu());
        FrameLayout.LayoutParams floating = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.BOTTOM | Gravity.RIGHT);
        // Keep the temporary host control above app bottom navigation.
        floating.setMargins(dp(16), dp(16), dp(16), dp(104));
        content.addView(floatingMenu, floating); floatingMenu.setVisibility(View.GONE);
        activity.setContentView(content);
    }

    void launcher(JSONArray entries, String message) throws JSONException {
        dismissMenu(); fullscreen = false; readerVisible = false;
        readerBar.setVisibility(View.GONE); pageProgress.setVisibility(View.GONE); browserSlot.setPadding(0, 0, 0, 0);
        cover.setVisibility(View.GONE); floatingMenu.setVisibility(View.GONE); actions = new JSONArray();
        browserSlot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        browserSlot.removeAllViews();
        LinearLayout list = new LinearLayout(activity); list.setOrientation(LinearLayout.VERTICAL); list.setPadding(dp(24), dp(32), dp(24), dp(24));
        TextView brand = text("Genesis", 16); brand.setTypeface(null, Typeface.BOLD); list.addView(brand);
        TextView heading = text("Apps", 32); heading.setTypeface(null, Typeface.BOLD); heading.setPadding(0, dp(24), 0, dp(8));
        if (Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true); list.addView(heading);
        TextView description = text("Your customized apps", 16); description.setPadding(0, 0, 0, dp(28)); list.addView(description);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i); JSONObject open = event("open");
            open.put("appletId", entry.getString("appletId")); open.put("sourceId", entry.getString("sourceId"));
            Button app = button(entry.getString("label"), () -> events.send(open));
            app.setTextSize(18); app.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            app.setPadding(dp(20), dp(20), dp(20), dp(20)); app.setMinHeight(dp(88));
            GradientDrawable card = new GradientDrawable(); card.setColor(wash); card.setCornerRadius(dp(18));
            app.setBackgroundTintList(null); app.setBackground(new RippleDrawable(ColorStateList.valueOf(0x20808080), card, null));
            LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, -2); row.bottomMargin = dp(12); list.addView(app, row);
        }
        if (entries.length() == 0) list.addView(text("Your custom apps will appear here.", 16));
        ScrollView scroll = new ScrollView(activity); scroll.addView(list); browserSlot.addView(scroll);
    }

    void presentation(JSONObject command) throws JSONException {
        presentationState = command.getString("state"); presentationMessage = command.getString("message"); actions = command.getJSONArray("actions");
        boolean siteError = "siteError".equals(presentationState);
        boolean failed = "failed".equals(presentationState) || "unsupported".equals(presentationState);
        boolean loading = "loading".equals(presentationState);
        coverTitle.setText(siteError ? "Page unavailable" : failed ? "Customization unavailable" : "Opening app"); coverMessage.setText(presentationMessage);
        recovery.setVisibility(failed ? View.VISIBLE : View.GONE);
        siteRecovery.setVisibility(siteError ? View.VISIBLE : View.GONE);
        boolean blocking = failed || siteError || loading;
        cover.setVisibility(blocking ? View.VISIBLE : View.GONE);
        // Hide the underlying document from accessibility while a blocking notice is visible.
        browserSlot.setImportantForAccessibility(blocking ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        floatingMenu.setVisibility(fullscreen || readerVisible ? View.GONE : View.VISIBLE); floatingMenu.bringToFront();
    }
    void fullscreen(View view) {
        dismissMenu(); fullscreen = true; floatingMenu.setVisibility(View.GONE);
        content.addView(view, new FrameLayout.LayoutParams(-1, -1));
    }
    void exitFullscreen(View view) { content.removeView(view); fullscreen = false; floatingMenu.setVisibility(readerVisible ? View.GONE : View.VISIBLE); floatingMenu.bringToFront(); }
    void diagnostics(String value) {
        TextView body = text(value, 16); body.setTextIsSelectable(true); body.setPadding(dp(24), dp(16), dp(24), dp(16));
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        new AlertDialog.Builder(activity).setTitle("Genesis debug inspector").setView(scroll).setPositiveButton("Close", null).show();
    }
    void error(String message) { new AlertDialog.Builder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show(); }
    void dispose() { dismissMenu(); }
    void navigation(String url, boolean reader, boolean canBack, boolean canForward) {
        readerUrl = url;
        readerVisible = reader;
        readerBack.setEnabled(canBack); readerForward.setEnabled(canForward);
        if (reader) {
            Uri parsed = Uri.parse(url);
            readerOrigin.setText(("https".equals(parsed.getScheme()) ? "🔒 " : "") + (parsed.getHost() == null ? "Web page" : parsed.getHost()));
        }
        readerBar.setVisibility(reader ? View.VISIBLE : View.GONE);
        browserSlot.setPadding(0, reader ? dp(52) : 0, 0, 0);
        floatingMenu.setVisibility(fullscreen || reader ? View.GONE : View.VISIBLE);
        readerBar.bringToFront(); pageProgress.bringToFront(); floatingMenu.bringToFront();
    }
    void pageLoading(int progress) {
        pageProgress.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
        pageProgress.setIndeterminate(progress <= 0);
        if (progress > 0) pageProgress.setProgress(progress);
    }
    void pageStarting() {
        coverTitle.setText("Loading page");
        coverMessage.setText("Preparing this Hacker News page…");
        recovery.setVisibility(View.GONE);
        siteRecovery.setVisibility(View.GONE);
        cover.setVisibility(View.VISIBLE);
        browserSlot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    void websiteFailure(String message) { pageLoading(100); error(message); }
    private void readerMenu() {
        PopupMenu popup = new PopupMenu(activity, readerBar, Gravity.END);
        popup.getMenu().add("Reload").setOnMenuItemClickListener(item -> { events.send(event("reload")); return true; });
        popup.getMenu().add("Copy link").setOnMenuItemClickListener(item -> { events.send(event("copyLink")); return true; });
        popup.getMenu().add("Share link").setOnMenuItemClickListener(item -> { events.send(event("shareLink")); return true; });
        popup.getMenu().add("Open in browser").setOnMenuItemClickListener(item -> { events.send(event("openBrowser")); return true; });
        popup.getMenu().add("Return to Apps").setOnMenuItemClickListener(item -> { events.send(event("home")); return true; });
        popup.getMenu().add("Service connections").setOnMenuItemClickListener(item -> { events.send(event("configureServices")); return true; });
        popup.show();
    }
    private void dismissMenu() { if (activeMenu != null) { activeMenu.dismiss(); activeMenu = null; } }
    private void menu() {
        dismissMenu(); PopupMenu popup = new PopupMenu(activity, floatingMenu, Gravity.END); activeMenu = popup;
        popup.setOnDismissListener(value -> { if (activeMenu == popup) activeMenu = null; });
        Menu menu = popup.getMenu();
        menu.add("Return to Apps").setOnMenuItemClickListener(item -> { events.send(event("home")); return true; });
        menu.add("Back").setOnMenuItemClickListener(item -> { events.send(event("back")); return true; });
        menu.add("Reload").setOnMenuItemClickListener(item -> { events.send(event("reload")); return true; });
        if (actions.length() > 0) {
            SubMenu pages = menu.addSubMenu("App pages");
            for (int i = 0; i < actions.length(); i++) {
                JSONObject action = actions.optJSONObject(i);
                if (action != null) pages.add(action.optString("label")).setOnMenuItemClickListener(item -> {
                    JSONObject open = event("openPage");
                    try { open.put("pageId", action.getString("pageId")); events.send(open); }
                    catch (JSONException error) { error("Invalid package action"); }
                    return true;
                });
            }
        }
        menu.add("Service connections").setOnMenuItemClickListener(item -> { events.send(event("configureServices")); return true; });
        SubMenu recoveryMenu = menu.addSubMenu("Recovery");
        recoveryMenu.add("Retry customization").setOnMenuItemClickListener(item -> { events.send(event("retry")); return true; });
        recoveryMenu.add("Open ordinary site").setOnMenuItemClickListener(item -> { events.send(event("ordinary")); return true; });
        if (!"ready".equals(presentationState)) recoveryMenu.add(presentationMessage).setEnabled(false);
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            SubMenu debugMenu = menu.addSubMenu("Developer tools");
            String[][] debug = {{"Inspect current document", "inspect"}, {"Qualify 20 reloads", "qualify"}, {"Simulate creator failure", "debugFailure"}, {"Terminate renderer", "debugTerminate"}};
            for (String[] item : debug) debugMenu.add(item[0]).setOnMenuItemClickListener(clicked -> { events.send(event(item[1])); return true; });
        }
        popup.show();
    }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private TextView text(String value, int size) { TextView text = new TextView(activity); text.setText(value); text.setTextSize(size); text.setTextColor(ink); return text; }
    private Button button(String label, Runnable action) {
        Button button = new Button(activity); button.setText(label); button.setAllCaps(false); button.setTextSize(16);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(dp(48)); button.setTextColor(ink);
        button.setBackgroundTintList(ColorStateList.valueOf(wash)); button.setOnClickListener(view -> action.run()); return button;
    }
    static JSONObject event(String type) {
        JSONObject event = new JSONObject();
        try { event.put("type", type); } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return event;
    }
}
