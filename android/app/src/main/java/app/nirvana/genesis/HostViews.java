package app.nirvana.genesis;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Generic native chrome; selection and navigation decisions come from Rust. */
final class HostViews {
    interface Events { void send(JSONObject event); }
    final FrameLayout browserSlot;
    private final Activity activity;
    private final Events events;
    private final TextView status;

    @SuppressWarnings("deprecation")
    HostViews(Activity activity, Events events) {
        this.activity = activity;
        this.events = events;
        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(activity);
        toolbar.addView(button("Home", () -> events.send(event("home"))));
        toolbar.addView(button("Back", () -> events.send(event("back"))));
        toolbar.addView(button("Reload", () -> events.send(event("reload"))));
        root.addView(toolbar);
        status = new TextView(activity);
        status.setPadding(16, 8, 16, 8);
        status.setTextColor(Color.DKGRAY);
        root.addView(status);
        browserSlot = new FrameLayout(activity);
        root.addView(browserSlot, new LinearLayout.LayoutParams(-1, 0, 1));
        activity.setContentView(root);
    }

    void launcher(JSONArray entries, String message) throws JSONException {
        browserSlot.removeAllViews();
        status.setText(message);
        LinearLayout list = new LinearLayout(activity);
        list.setOrientation(LinearLayout.VERTICAL);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            JSONObject open = event("open");
            open.put("appletId", entry.getString("appletId"));
            open.put("sourceId", entry.getString("sourceId"));
            list.addView(button(entry.getString("label"), () -> events.send(open)));
        }
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(list);
        browserSlot.addView(scroll);
    }

    void browsing() { status.setText(R.string.browsing_status); }
    void error(String message) { status.setText(message); }

    private Button button(String label, Runnable action) {
        Button button = new Button(activity);
        button.setText(label);
        button.setOnClickListener(view -> action.run());
        return button;
    }

    static JSONObject event(String type) {
        JSONObject event = new JSONObject();
        try { event.put("type", type); }
        catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return event;
    }
}
