package app.nirvana.genesis;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Build;
import android.view.Gravity;
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

/** Generic rendering of Rust presentation commands, outside the website's UI. */
final class HostViews {
    interface Events { void send(JSONObject event); }
    final FrameLayout browserSlot;
    private final Activity activity;
    private final int paper, ink, wash;
    private final Events events;
    private final TextView status;
    private final TextView cover;
    private final FrameLayout content;
    private final LinearLayout recovery;
    private JSONArray actions = new JSONArray();

    @SuppressWarnings("deprecation")
    HostViews(Activity activity, Events events) {
        this.activity = activity; this.events = events;
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        paper = Color.parseColor(dark ? "#1d1b18" : "#faf7f2");
        ink = Color.parseColor(dark ? "#f5eee4" : "#24211c");
        wash = Color.parseColor(dark ? "#363027" : "#f3e9dc");
        LinearLayout root = new LinearLayout(activity); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(paper);
        root.setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()); view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(activity);
        toolbar.addView(button("Home", () -> events.send(event("home"))));
        toolbar.addView(button("Back", () -> events.send(event("back"))));
        toolbar.addView(button("Reload", () -> events.send(event("reload"))));
        Button menu = button("Menu", () -> {}); menu.setOnClickListener(view -> menu(menu)); toolbar.addView(menu);
        toolbar.setPadding(8, 4, 8, 4);
        for (int i = 0; i < toolbar.getChildCount(); i++) {
            toolbar.getChildAt(i).setLayoutParams(new LinearLayout.LayoutParams(0, -2, 1));
        }
        root.addView(toolbar);
        status = new TextView(activity); status.setPadding(16, 8, 16, 8); status.setTextColor(ink); root.addView(status);
        recovery = new LinearLayout(activity);
        recovery.addView(button("Retry", () -> events.send(event("retry"))));
        recovery.addView(button("Open ordinary site", () -> events.send(event("ordinary"))));
        recovery.setVisibility(View.GONE); root.addView(recovery);
        content = new FrameLayout(activity);
        browserSlot = new FrameLayout(activity); content.addView(browserSlot, new FrameLayout.LayoutParams(-1, -1));
        cover = new TextView(activity); cover.setGravity(Gravity.CENTER); cover.setPadding(24, 24, 24, 24);
        cover.setTextColor(ink); cover.setBackgroundColor(paper); cover.setClickable(true); cover.setVisibility(View.GONE);
        content.addView(cover, new FrameLayout.LayoutParams(-1, -1));
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1)); activity.setContentView(root);
    }
    void launcher(JSONArray entries, String message) throws JSONException {
        cover.setVisibility(View.GONE); recovery.setVisibility(View.GONE); actions = new JSONArray();
        browserSlot.removeAllViews(); status.setVisibility(View.VISIBLE); status.setText(message);
        LinearLayout list = new LinearLayout(activity); list.setOrientation(LinearLayout.VERTICAL);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i); JSONObject open = event("open");
            open.put("appletId", entry.getString("appletId")); open.put("sourceId", entry.getString("sourceId"));
            if (!entry.isNull("pageId")) open.put("pageId", entry.getString("pageId"));
            list.addView(button(entry.getString("label"), () -> events.send(open)));
        }
        ScrollView scroll = new ScrollView(activity); scroll.addView(list); browserSlot.addView(scroll);
    }
    void presentation(JSONObject command) throws JSONException {
        String state = command.getString("state"); String message = command.getString("message");
        status.setText(message); status.setVisibility("ready".equals(state) ? View.GONE : View.VISIBLE); actions = command.getJSONArray("actions");
        boolean failed = "failed".equals(state) || "unsupported".equals(state);
        recovery.setVisibility(failed ? View.VISIBLE : View.GONE);
        boolean covering = failed || "loading".equals(state);
        cover.setText(message); cover.setVisibility(covering ? View.VISIBLE : View.GONE);
    }
    void fullscreen(View view) { content.addView(view, new FrameLayout.LayoutParams(-1, -1)); }
    void exitFullscreen(View view) { content.removeView(view); }
    void diagnostics(String text) {
        TextView body = new TextView(activity); body.setText(text); body.setTextIsSelectable(true); body.setPadding(24, 16, 24, 16);
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        new AlertDialog.Builder(activity).setTitle("Genesis debug inspector").setView(scroll).setPositiveButton("Close", null).show();
    }
    void error(String message) { status.setVisibility(View.VISIBLE); status.setText(message); }
    private void menu(Button anchor) {
        PopupMenu popup = new PopupMenu(activity, anchor);
        for (int i = 0; i < actions.length(); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action != null) popup.getMenu().add(action.optString("label")).setOnMenuItemClickListener(item -> {
                JSONObject open = event("openPage");
                try { open.put("pageId", action.getString("pageId")); events.send(open); }
                catch (JSONException error) { error("Invalid package action"); }
                return true;
            });
        }
        popup.getMenu().add("Retry customization").setOnMenuItemClickListener(item -> { events.send(event("retry")); return true; });
        popup.getMenu().add("Open ordinary site").setOnMenuItemClickListener(item -> { events.send(event("ordinary")); return true; });
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            String[][] debug = {{"Inspect current document", "inspect"}, {"Qualify 20 reloads", "qualify"}, {"Simulate creator failure", "debugFailure"}, {"Terminate renderer", "debugTerminate"}};
            for (String[] item : debug) popup.getMenu().add(item[0]).setOnMenuItemClickListener(clicked -> { events.send(event(item[1])); return true; });
        }
        popup.show();
    }
    private Button button(String label, Runnable action) {
        Button button = new Button(activity); button.setText(label); button.setAllCaps(false); button.setTextSize(14);
        button.setMinWidth(0); button.setMinimumWidth(0);
        button.setMinHeight((int) (48 * activity.getResources().getDisplayMetrics().density));
        button.setTextColor(ink);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(wash));
        button.setOnClickListener(view -> action.run()); return button;
    }
    static JSONObject event(String type) {
        JSONObject event = new JSONObject();
        try { event.put("type", type); } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return event;
    }
}
