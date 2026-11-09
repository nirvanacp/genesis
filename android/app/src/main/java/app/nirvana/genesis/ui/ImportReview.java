package app.nirvana.genesis.ui;

import android.content.Context;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The review before Genesis installs an applet build: what it is, where it comes from, what it
 * may reach, and what installing it does to the applet already installed. The buttons follow the
 * host's outcome; every way out of the dialog answers the host exactly once.
 */
public final class ImportReview {
    public interface Listener {
        /** `replace` is "keep" or "erase" for a replacement, null otherwise. */
        void decide(boolean accept, String replace);
    }

    private ImportReview() {}

    public static AlertDialog show(Context context, Tokens tokens, JSONObject review, Listener listener) {
        String name = review.optString("name", review.optString("appletId"));
        String version = AddApplet.text(review, "version");
        JSONObject outcome = review.optJSONObject("outcome");
        String kind = outcome == null ? "blocked" : outcome.optString("kind");

        LinearLayout column = AddApplet.column(context, tokens);
        column.addView(tokens.text(summary(kind, outcome, name, version, review.optString("sourceLabel")), Tokens.Type.BODY_LARGE, tokens.onSurface));
        section(column, tokens, "Applet", review.optString("appletId") + (version == null ? "" : " · version " + version));
        section(column, tokens, "Source", review.optString("sourceLabel"));
        section(column, tokens, "Websites", join(review.optJSONArray("origins"), "None"));
        JSONObject capabilities = review.optJSONObject("capabilities");
        if (capabilities != null) {
            section(column, tokens, "Stores data on this phone", capabilities.optBoolean("storage") ? "Yes" : "No");
            section(column, tokens, "Service connections", join(capabilities.optJSONArray("services"), "None"));
        }
        JSONArray warnings = review.optJSONArray("warnings");
        for (int i = 0; warnings != null && i < warnings.length(); i++) column.addView(warning(context, tokens, warnings.optString(i)));
        ScrollView scroll = new ScrollView(context);
        scroll.addView(column);

        boolean[] answered = {false};
        java.util.function.BiConsumer<Boolean, String> answer = (accept, replace) -> {
            if (answered[0]) return;
            answered[0] = true;
            listener.decide(accept, replace);
        };
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(context).setTitle(title(kind, name)).setView(scroll)
            .setOnCancelListener(d -> answer.accept(false, null));
        switch (kind) {
            case "replace":
                builder.setPositiveButton("Replace and keep data", (d, w) -> answer.accept(true, "keep"))
                    .setNeutralButton("Replace and erase data", (d, w) -> confirmErase(context, name, answer))
                    .setNegativeButton("Cancel", (d, w) -> answer.accept(false, null));
                break;
            case "blocked":
                builder.setPositiveButton("Close", (d, w) -> answer.accept(false, null));
                break;
            default:
                builder.setPositiveButton(action(kind), (d, w) -> answer.accept(true, null))
                    .setNegativeButton("Cancel", (d, w) -> answer.accept(false, null));
                break;
        }
        return builder.show();
    }

    /** Erasing deletes data for good, so it asks once more. */
    private static void confirmErase(Context context, String name, java.util.function.BiConsumer<Boolean, String> answer) {
        new MaterialAlertDialogBuilder(context).setTitle("Erase " + name + "'s data?")
            .setMessage("Its stored data and service connections are deleted. This cannot be undone.")
            .setPositiveButton("Erase and replace", (d, w) -> answer.accept(true, "erase"))
            .setNegativeButton("Cancel", (d, w) -> answer.accept(false, null))
            .setOnCancelListener(d -> answer.accept(false, null))
            .show();
    }

    private static String title(String kind, String name) {
        switch (kind) {
            case "update": return "Update " + name + "?";
            case "reinstall": return "Reinstall " + name + "?";
            case "downgrade": return "Install an older " + name + "?";
            case "replace": return "Replace " + name + "?";
            case "blocked": return "Can't install " + name;
            default: return "Install " + name + "?";
        }
    }

    private static String action(String kind) {
        switch (kind) {
            case "update": return "Update";
            case "reinstall": return "Reinstall";
            case "downgrade": return "Install older version";
            default: return "Install";
        }
    }

    private static String summary(String kind, JSONObject outcome, String name, String version, String source) {
        String from = outcome == null ? null : AddApplet.text(outcome, "from");
        String shown = version == null ? "this build" : "version " + version;
        switch (kind) {
            case "update": return from == null ? "Update " + name + " to " + shown + "." : "Update " + name + " from version " + from + " to " + shown + ".";
            case "reinstall": return "This build of " + name + " is already installed. Reinstalling keeps its data.";
            case "downgrade": return "Version " + from + " is installed. Installing " + shown + " keeps the applet's data.";
            case "replace": return name + " is already installed from " + outcome.optString("fromSource") + ". This build comes from " + source + ".";
            case "blocked": return outcome == null ? "Genesis cannot install this build." : outcome.optString("reason");
            default: return "Install " + name + ", " + shown + ".";
        }
    }

    private static void section(LinearLayout column, Tokens tokens, String label, String value) {
        TextView title = tokens.text(label, Tokens.Type.LABEL_LARGE, tokens.onSurfaceVariant);
        title.setPadding(0, tokens.dp(12), 0, 0);
        column.addView(title);
        column.addView(tokens.text(value, Tokens.Type.BODY_MEDIUM, tokens.onSurface));
    }

    private static android.view.View warning(Context context, Tokens tokens, String message) {
        LinearLayout row = new LinearLayout(context);
        row.setPadding(tokens.dp(12), tokens.dp(8), tokens.dp(12), tokens.dp(8));
        row.setBackground(tokens.rounded(tokens.errorContainer, 12));
        row.addView(tokens.icon(app.nirvana.genesis.R.drawable.ic_warning, tokens.onErrorContainer), new LinearLayout.LayoutParams(tokens.dp(20), tokens.dp(20)));
        TextView text = tokens.text(message, Tokens.Type.BODY_MEDIUM, tokens.onErrorContainer);
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(tokens.dp(8));
        row.addView(text, textLayout);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.topMargin = tokens.dp(12);
        row.setLayoutParams(layout);
        return row;
    }

    private static String join(JSONArray values, String empty) {
        if (values == null || values.length() == 0) return empty;
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < values.length(); i++) text.append(i == 0 ? "" : "\n").append(values.optString(i));
        return text.toString();
    }
}
