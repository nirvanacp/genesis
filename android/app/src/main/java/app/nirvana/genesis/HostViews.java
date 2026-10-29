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
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
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
    private final Button floatingMenu;
    private PopupMenu activeMenu;
    private JSONArray actions = new JSONArray();
    private String presentationState = "loading", presentationMessage = "";
    private boolean fullscreen;

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
        cover = new ScrollView(activity); cover.setFillViewport(true); cover.setBackgroundColor(paper);
        cover.addView(notice, new ScrollView.LayoutParams(-1, -2)); cover.setVisibility(View.GONE);
        content.addView(cover, new FrameLayout.LayoutParams(-1, -1));

        floatingMenu = button("G", () -> {}); floatingMenu.setTextSize(20); floatingMenu.setTypeface(null, Typeface.BOLD);
        floatingMenu.setContentDescription("Genesis menu"); floatingMenu.setTooltipText("Genesis menu");
        floatingMenu.setPadding(0, 0, 0, 0); floatingMenu.setElevation(dp(6));
        floatingMenu.setBackgroundTintList(null);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(ink);
        floatingMenu.setBackground(new RippleDrawable(ColorStateList.valueOf(0x40808080), circle, null)); floatingMenu.setTextColor(paper);
        floatingMenu.setOnClickListener(view -> menu());
        FrameLayout.LayoutParams floating = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.BOTTOM | Gravity.RIGHT);
        floating.setMargins(dp(16), dp(16), dp(16), dp(16));
        content.addView(floatingMenu, floating); floatingMenu.setVisibility(View.GONE);
        activity.setContentView(content);
    }

    void launcher(JSONArray entries, String message) throws JSONException {
        dismissMenu(); fullscreen = false;
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
        boolean failed = "failed".equals(presentationState) || "unsupported".equals(presentationState);
        boolean loading = "loading".equals(presentationState);
        coverTitle.setText(failed ? "Customization unavailable" : "Opening app"); coverMessage.setText(presentationMessage);
        recovery.setVisibility(failed ? View.VISIBLE : View.GONE); cover.setVisibility(failed || loading ? View.VISIBLE : View.GONE);
        // Hide the underlying document from accessibility while a blocking notice is visible.
        browserSlot.setImportantForAccessibility(failed || loading ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        floatingMenu.setVisibility(fullscreen ? View.GONE : View.VISIBLE); floatingMenu.bringToFront();
    }
    void fullscreen(View view) {
        dismissMenu(); fullscreen = true; floatingMenu.setVisibility(View.GONE);
        content.addView(view, new FrameLayout.LayoutParams(-1, -1));
    }
    void exitFullscreen(View view) { content.removeView(view); fullscreen = false; floatingMenu.setVisibility(View.VISIBLE); floatingMenu.bringToFront(); }
    void diagnostics(String value) {
        TextView body = text(value, 16); body.setTextIsSelectable(true); body.setPadding(dp(24), dp(16), dp(24), dp(16));
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        new AlertDialog.Builder(activity).setTitle("Genesis debug inspector").setView(scroll).setPositiveButton("Close", null).show();
    }
    void error(String message) { new AlertDialog.Builder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show(); }
    void dispose() { dismissMenu(); }
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
