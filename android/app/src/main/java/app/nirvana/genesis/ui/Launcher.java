package app.nirvana.genesis.ui;

import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The launcher's content: the Genesis title, then the installed applets as one segmented list,
 * or the empty state with the install command.
 */
public final class Launcher {
    public interface Listener { void open(String appletId); }

    private final Context context;
    private final Tokens tokens;
    private final Listener listener;

    public Launcher(Context context, Tokens tokens, Listener listener) {
        this.context = context;
        this.tokens = tokens;
        this.listener = listener;
    }

    public View build(JSONArray applets) {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(0, 0, 0, tokens.dp(24));
        TextView title = tokens.text("Genesis", Tokens.Type.TITLE_LARGE, tokens.onSurface);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setMinHeight(tokens.dp(64));
        title.setPadding(tokens.dp(16), 0, tokens.dp(16), 0);
        title.setAccessibilityHeading(true);
        column.addView(title);
        if (applets.length() == 0) {
            column.addView(empty());
            return column;
        }
        TextView section = tokens.text("Applets", Tokens.Type.LABEL_LARGE, tokens.primary);
        section.setPadding(tokens.dp(16), tokens.dp(16), tokens.dp(16), tokens.dp(8));
        section.setAccessibilityHeading(true);
        column.addView(section);
        for (int i = 0; i < applets.length(); i++) {
            JSONObject entry = applets.optJSONObject(i);
            if (entry == null) continue;
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
            layout.setMargins(tokens.dp(12), i == 0 ? 0 : tokens.dp(2), tokens.dp(12), 0);
            column.addView(row(entry, i == 0, i == applets.length() - 1), layout);
        }
        return column;
    }

    /** The launcher badge for an applet built for another Genesis; null when it is current. */
    public static String badge(JSONObject entry) {
        if (!"incompatible".equals(entry.optString("status"))) return null;
        return "newer".equals(entry.optString("direction")) ? "Needs a newer Genesis" : "Needs update";
    }

    private View row(JSONObject entry, boolean first, boolean last) {
        String id = entry.optString("appletId");
        String name = entry.optString("name", id);
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(tokens.dp(72));
        row.setPadding(tokens.dp(16), tokens.dp(12), tokens.dp(16), tokens.dp(12));
        row.setBackground(tokens.pressable(tokens.surfaceContainer, first ? 20 : 4, last ? 20 : 4));
        row.setClickable(true);
        row.setFocusable(true);

        TextView monogram = tokens.monogram(name, entry.optString("accent", null), 40, 16);
        row.addView(monogram, new LinearLayout.LayoutParams(tokens.dp(40), tokens.dp(40)));

        LinearLayout text = new LinearLayout(context);
        text.setOrientation(LinearLayout.VERTICAL);
        text.addView(tokens.text(name, Tokens.Type.TITLE_MEDIUM, tokens.onSurface));
        text.addView(tokens.text(id, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));
        String badge = badge(entry);
        if (badge != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.topMargin = tokens.dp(6);
            text.addView(badgeView(badge), layout);
        }
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(tokens.dp(16));
        row.addView(text, textLayout);

        row.setContentDescription(badge == null ? name : name + ", " + badge.toLowerCase());
        row.setOnClickListener(v -> listener.open(id));
        return row;
    }

    private View badgeView(String label) {
        LinearLayout badge = new LinearLayout(context);
        badge.setGravity(Gravity.CENTER_VERTICAL);
        badge.setBackground(tokens.rounded(tokens.errorContainer, 8));
        badge.setPadding(tokens.dp(6), tokens.dp(4), tokens.dp(8), tokens.dp(4));
        badge.addView(tokens.icon(R.drawable.ic_warning, tokens.onErrorContainer), new LinearLayout.LayoutParams(tokens.dp(16), tokens.dp(16)));
        TextView text = tokens.text(label, Tokens.Type.LABEL_MEDIUM, tokens.onErrorContainer);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
        layout.setMarginStart(tokens.dp(4));
        badge.addView(text, layout);
        badge.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return badge;
    }

    private View empty() {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(tokens.dp(24), tokens.dp(48), tokens.dp(24), 0);

        FrameLayout circle = new FrameLayout(context);
        android.graphics.drawable.GradientDrawable shape = new android.graphics.drawable.GradientDrawable();
        shape.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        shape.setColor(tokens.secondaryContainer);
        circle.setBackground(shape);
        circle.addView(tokens.icon(R.drawable.ic_applets, tokens.onSecondaryContainer), new FrameLayout.LayoutParams(tokens.dp(24), tokens.dp(24), Gravity.CENTER));
        column.addView(circle, new LinearLayout.LayoutParams(tokens.dp(56), tokens.dp(56)));

        TextView title = tokens.text("No applets yet", Tokens.Type.TITLE_LARGE, tokens.onSurface);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, tokens.dp(16), 0, tokens.dp(8));
        title.setAccessibilityHeading(true);
        column.addView(title, new LinearLayout.LayoutParams(-1, -2));

        TextView body = tokens.text("Build an applet on your computer, connect this phone with USB, and run:", Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, 0, 0, tokens.dp(16));
        column.addView(body, new LinearLayout.LayoutParams(-1, -2));

        column.addView(tokens.commandBox("genesis-applet dev install <dir>"), new LinearLayout.LayoutParams(-1, -2));
        return column;
    }
}
