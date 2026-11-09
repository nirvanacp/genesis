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
 * The launcher's content: the Genesis title with its menu, then the installed applets as one
 * segmented list, or the empty state with Add applet and the install command.
 */
public final class Launcher {
    public interface Listener {
        void open(String appletId);
        /** The update badge: review the update the host found. */
        void update(String appletId);
        /** Long press: Check for update and Remove. */
        void options(JSONObject entry);
        void menu();
        void add();
    }

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
        LinearLayout header = new LinearLayout(context);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(tokens.dp(16), 0, tokens.dp(4), 0);
        TextView title = tokens.text("Genesis", Tokens.Type.TITLE_LARGE, tokens.onSurface);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setMinHeight(tokens.dp(64));
        title.setAccessibilityHeading(true);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        android.widget.ImageView menu = tokens.icon(R.drawable.ic_nav_more, tokens.onSurfaceVariant);
        menu.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        menu.setBackground(tokens.pressable(android.graphics.Color.TRANSPARENT, 24, 24));
        menu.setClickable(true);
        menu.setFocusable(true);
        menu.setContentDescription("Genesis menu");
        menu.setOnClickListener(v -> listener.menu());
        header.addView(menu, new LinearLayout.LayoutParams(tokens.dp(48), tokens.dp(48)));
        column.addView(header);
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
        String version = entry.isNull("version") ? null : entry.optString("version", null);
        text.addView(tokens.text(version == null ? id : id + " · " + version, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));
        String badge = badge(entry);
        if (badge != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.topMargin = tokens.dp(6);
            text.addView(badgeView(badge), layout);
        }
        String update = updateLabel(entry);
        if (update != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.topMargin = tokens.dp(6);
            text.addView(updateView(update, () -> listener.update(id)), layout);
        }
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(tokens.dp(16));
        row.addView(text, textLayout);

        String description = badge == null ? name : name + ", " + badge.toLowerCase();
        row.setContentDescription(update == null ? description : description + ", " + update.toLowerCase());
        row.setOnClickListener(v -> listener.open(id));
        row.setOnLongClickListener(v -> { listener.options(entry); return true; });
        return row;
    }

    /** The update the host found for this applet, or null. */
    static String updateLabel(JSONObject entry) {
        JSONObject update = entry.optJSONObject("update");
        if (update == null) return null;
        String version = update.isNull("version") ? null : update.optString("version", null);
        if (update.optBoolean("withdrawn")) return version == null ? "Release withdrawn" : "Release withdrawn, " + version + " available";
        return version == null ? null : "Update to " + version + (update.optBoolean("prerelease") ? " (prerelease)" : "");
    }

    /** A tonal chip that opens the update's review. */
    private View updateView(String label, Runnable open) {
        TextView chip = tokens.text(label, Tokens.Type.LABEL_LARGE, tokens.onSecondaryContainer);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setMinHeight(tokens.dp(32));
        chip.setPadding(tokens.dp(12), 0, tokens.dp(12), 0);
        chip.setBackground(tokens.pressable(tokens.secondaryContainer, 8, 8));
        chip.setClickable(true);
        chip.setFocusable(true);
        chip.setOnClickListener(v -> open.run());
        return chip;
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

        TextView add = tokens.text("Add an applet from a GitHub repository or a file.", Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant);
        add.setGravity(Gravity.CENTER);
        add.setPadding(0, 0, 0, tokens.dp(12));
        column.addView(add, new LinearLayout.LayoutParams(-1, -2));
        com.google.android.material.button.MaterialButton button = tokens.button("Add applet", false);
        button.setOnClickListener(v -> listener.add());
        column.addView(button, new LinearLayout.LayoutParams(-2, -2));

        TextView body = tokens.text("Or build one on your computer, connect this phone with USB, and run:", Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, tokens.dp(24), 0, tokens.dp(16));
        column.addView(body, new LinearLayout.LayoutParams(-1, -2));

        column.addView(tokens.commandBox("genesis-applet dev install <dir>"), new LinearLayout.LayoutParams(-1, -2));
        return column;
    }
}
