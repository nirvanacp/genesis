package app.nirvana.genesis.ui;

import android.content.Context;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.bottomsheet.BottomSheetDragHandleView;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.snackbar.Snackbar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sheets for an applet that cannot run: one built for another Genesis version, or one whose page
 * stopped. An incompatible import announces itself with a snackbar that opens the sheet.
 */
public final class StatusSheet {
    private static final String REBUILD = "genesis-applet build <dir> && genesis-applet dev install <dir>";

    private StatusSheet() {}

    /**
     * Why the applet can't open and what fixes it. `entry` is the launcher entry with its
     * mismatches; `details` is the host's plain-text explanation, shown when there are none.
     */
    public static void incompatible(Context context, Tokens tokens, JSONObject entry, String details) {
        String name = name(entry);
        String direction = entry == null ? "" : entry.optString("direction");
        boolean newer = "newer".equals(direction), mixed = "mixed".equals(direction);
        BottomSheetDialog dialog = new BottomSheetDialog(context);
        LinearLayout column = column(context, tokens);

        column.addView(warning(context, tokens), centered(tokens, 56));
        String title = newer ? name + " needs a newer Genesis" : mixed ? name + " can't open" : name + " needs an update";
        column.addView(title(tokens, title));
        String body = newer ? "Update Genesis on this phone, then open " + name + " again."
            : mixed ? name + " was built for a different Genesis. Update Genesis on this phone, then rebuild the applet on your computer and install it again:"
            : name + " was built for an older Genesis, so it can't open. Rebuild it on your computer and install it again:";
        column.addView(body(tokens, body));

        JSONArray mismatches = entry == null ? null : entry.optJSONArray("mismatches");
        if (mismatches != null && mismatches.length() > 0) {
            column.addView(table(context, tokens, mismatches), spaced(tokens, -1));
        } else if (details != null && !details.isEmpty()) {
            column.addView(body(tokens, details));
        }
        if (!newer) column.addView(tokens.commandBox(REBUILD), spaced(tokens, -1));

        MaterialButton close = tokens.textButton("Close");
        close.setOnClickListener(v -> dialog.dismiss());
        column.addView(close, end(tokens));
        show(dialog, context, column);
    }

    /** A page in the applet stopped; Genesis already closed the applet. */
    public static void rendererLost(Context context, Tokens tokens, String name, Runnable reload) {
        BottomSheetDialog dialog = new BottomSheetDialog(context);
        LinearLayout column = column(context, tokens);
        column.addView(warning(context, tokens), centered(tokens, 56));
        column.addView(title(tokens, name + " stopped"));
        column.addView(body(tokens, "A page in this applet stopped responding, and Genesis closed it. Reload the applet to start it again."));

        LinearLayout buttons = new LinearLayout(context);
        buttons.setGravity(Gravity.END);
        MaterialButton close = tokens.textButton("Close");
        close.setOnClickListener(v -> dialog.dismiss());
        buttons.addView(close);
        if (reload != null) {
            MaterialButton again = tokens.button("Reload applet", false);
            again.setOnClickListener(v -> { dialog.dismiss(); reload.run(); });
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.setMarginStart(tokens.dp(8));
            buttons.addView(again, layout);
        }
        column.addView(buttons, spaced(tokens, -1));
        show(dialog, context, column);
    }

    /** An imported applet that this Genesis cannot run: a snackbar whose Details opens the sheet. */
    public static void importNotice(View anchor, Context context, Tokens tokens, JSONObject entry, String details) {
        String name = name(entry);
        boolean newer = entry != null && "newer".equals(entry.optString("direction"));
        Snackbar.make(anchor, newer ? name + " needs a newer Genesis" : name + " needs an update", Snackbar.LENGTH_LONG)
            .setAction("Details", v -> incompatible(context, tokens, entry, details))
            .show();
    }

    private static String name(JSONObject entry) { return entry == null ? "Applet" : entry.optString("name", "Applet"); }

    private static LinearLayout column(Context context, Tokens tokens) {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(tokens.dp(24), 0, tokens.dp(24), tokens.dp(16));
        column.addView(new BottomSheetDragHandleView(context));
        return column;
    }

    private static View warning(Context context, Tokens tokens) {
        FrameLayout circle = new FrameLayout(context);
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.OVAL);
        shape.setColor(tokens.errorContainer);
        circle.setBackground(shape);
        circle.addView(tokens.icon(R.drawable.ic_warning, tokens.onErrorContainer), new FrameLayout.LayoutParams(tokens.dp(24), tokens.dp(24), Gravity.CENTER));
        return circle;
    }

    private static TextView title(Tokens tokens, String value) {
        TextView title = tokens.text(value, Tokens.Type.HEADLINE_SMALL, tokens.onSurface);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, tokens.dp(16), 0, tokens.dp(8));
        title.setAccessibilityHeading(true);
        return title;
    }

    private static TextView body(Tokens tokens, String value) {
        TextView body = tokens.text(value, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant);
        body.setPadding(0, tokens.dp(4), 0, tokens.dp(4));
        return body;
    }

    /** Each mismatched version as "field  applet → Genesis", read aloud as "field: applet 5, Genesis 6". */
    private static View table(Context context, Tokens tokens, JSONArray mismatches) {
        LinearLayout table = new LinearLayout(context);
        table.setOrientation(LinearLayout.VERTICAL);
        table.setBackground(tokens.rounded(tokens.surfaceContainer, 12));
        table.setPadding(tokens.dp(16), tokens.dp(8), tokens.dp(16), tokens.dp(8));
        TextView header = tokens.text("Applet → Genesis", Tokens.Type.LABEL_MEDIUM, tokens.onSurfaceVariant);
        header.setGravity(Gravity.END);
        header.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        header.setPadding(0, 0, 0, tokens.dp(4));
        table.addView(header, new LinearLayout.LayoutParams(-1, -2));
        for (int i = 0; i < mismatches.length(); i++) {
            JSONObject mismatch = mismatches.optJSONObject(i);
            if (mismatch == null) continue;
            String field = mismatch.optString("field"), applet = mismatch.optString("applet"), host = mismatch.optString("host");
            LinearLayout row = new LinearLayout(context);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setMinimumHeight(tokens.dp(32));
            TextView name = tokens.text(field, Tokens.Type.BODY_MEDIUM, tokens.onSurface);
            name.setTypeface(android.graphics.Typeface.MONOSPACE);
            row.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(tokens.text(applet + " → " + host, Tokens.Type.BODY_MEDIUM, tokens.onSurface));
            row.setFocusable(true);
            row.setContentDescription(field + ": applet " + applet + ", Genesis " + host);
            table.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }
        return table;
    }

    private static LinearLayout.LayoutParams centered(Tokens tokens, int sizeDp) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(tokens.dp(sizeDp), tokens.dp(sizeDp));
        layout.gravity = Gravity.CENTER_HORIZONTAL;
        return layout;
    }

    private static LinearLayout.LayoutParams spaced(Tokens tokens, int width) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(width, -2);
        layout.topMargin = tokens.dp(12);
        return layout;
    }

    private static LinearLayout.LayoutParams end(Tokens tokens) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
        layout.gravity = Gravity.END;
        layout.topMargin = tokens.dp(8);
        return layout;
    }

    private static void show(BottomSheetDialog dialog, Context context, View content) {
        ScrollView scroll = new ScrollView(context);
        scroll.addView(content);
        dialog.setContentView(scroll);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.show();
    }
}
