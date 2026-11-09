package app.nirvana.genesis.ui;

import android.content.Context;
import android.text.InputType;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.appcompat.app.AlertDialog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.materialswitch.MaterialSwitch;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Adding an applet: the dialog that takes a repository or opens the file picker, and the list of
 * applets a repository offers. The host resolves, downloads and reviews; these dialogs only ask.
 */
public final class AddApplet {
    public interface Listener {
        void addFromRepository(String input);
        void pickFile();
        /** `version` null is the newest compatible stable version. */
        void choose(String appletId, String version);
        void cancel();
    }

    private AddApplet() {}

    /** A repository field, with Add from file beside it. */
    public static void show(Context context, Tokens tokens, Listener listener) {
        LinearLayout form = column(context, tokens);
        form.addView(body(tokens, "Enter a public GitHub repository, as owner/name or a github.com link."));
        EditText input = new EditText(context);
        input.setHint("owner/name");
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO);
        form.addView(input, new LinearLayout.LayoutParams(-1, -2));
        MaterialButton file = tokens.textButton("Add from file");
        LinearLayout.LayoutParams fileLayout = new LinearLayout.LayoutParams(-2, -2);
        fileLayout.topMargin = tokens.dp(8);
        form.addView(file, fileLayout);

        AlertDialog dialog = new MaterialAlertDialogBuilder(context).setTitle("Add applet").setView(form)
            .setNegativeButton("Cancel", null).setPositiveButton("Add", null).create();
        Runnable add = () -> {
            String value = input.getText().toString().trim();
            if (value.isEmpty()) { input.setError("Enter a repository"); return; }
            dialog.dismiss();
            listener.addFromRepository(value);
        };
        input.setOnEditorActionListener((v, action, event) -> {
            if (action != EditorInfo.IME_ACTION_GO) return false;
            add.run();
            return true;
        });
        file.setOnClickListener(v -> {
            dialog.dismiss();
            listener.pickFile();
        });
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> add.run()));
        dialog.show();
    }

    /**
     * The applets in `repository`. Dismissing the list without a choice ends the host's flow.
     * Returns the dialog so the shell can close it when the host moves on.
     */
    public static AlertDialog repository(Context context, Tokens tokens, String repository, String note, JSONArray applets, Listener listener) {
        LinearLayout column = column(context, tokens);
        if (note != null && !note.isEmpty()) column.addView(body(tokens, note));
        MaterialSwitch prereleases = new MaterialSwitch(context);
        prereleases.setText("Show prereleases");
        tokens.style(prereleases, Tokens.Type.BODY_LARGE, tokens.onSurface);
        if (hasPrerelease(applets)) column.addView(prereleases, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout list = new LinearLayout(context);
        list.setOrientation(LinearLayout.VERTICAL);
        column.addView(list, new LinearLayout.LayoutParams(-1, -2));
        ScrollView scroll = new ScrollView(context);
        scroll.addView(column);

        AlertDialog dialog = new MaterialAlertDialogBuilder(context).setTitle(repository).setView(scroll)
            .setNegativeButton("Close", (d, w) -> listener.cancel()).create();
        dialog.setOnCancelListener(d -> listener.cancel());
        Listener choosing = new Listener() {
            @Override public void addFromRepository(String input) {}
            @Override public void pickFile() {}
            @Override public void choose(String appletId, String version) {
                dialog.dismiss();
                listener.choose(appletId, version);
            }
            @Override public void cancel() {}
        };
        Runnable fill = () -> {
            list.removeAllViews();
            for (int i = 0; i < applets.length(); i++) {
                JSONObject applet = applets.optJSONObject(i);
                if (applet != null) list.addView(row(context, tokens, applet, prereleases.isChecked(), choosing), rowLayout(tokens));
            }
        };
        prereleases.setOnCheckedChangeListener((v, checked) -> fill.run());
        fill.run();
        dialog.show();
        return dialog;
    }

    private static View row(Context context, Tokens tokens, JSONObject applet, boolean showPrereleases, Listener listener) {
        String id = applet.optString("appletId");
        String installed = text(applet, "installed");
        List<JSONObject> versions = versions(applet, showPrereleases);
        // The newest stable version the host picked, or with prereleases shown, the newest compatible one.
        String target = text(applet, "version");
        if (showPrereleases && !versions.isEmpty()) target = versions.get(0).optString("version");

        LinearLayout row = new LinearLayout(context);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(tokens.dp(16), tokens.dp(12), tokens.dp(16), tokens.dp(8));
        row.setBackground(tokens.rounded(tokens.surfaceContainerHigh, 16));
        row.addView(tokens.text(applet.optString("name", id), Tokens.Type.TITLE_MEDIUM, tokens.onSurface));
        String place = ".".equals(applet.optString("path")) ? id : id + " · " + applet.optString("path");
        String channel = "branch".equals(applet.optString("channel")) ? " · from the branch" : "";
        row.addView(tokens.text(place + channel, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));
        String state = target == null ? "No version this Genesis can run" : "Version " + target;
        if (installed != null) state += " · installed " + installed;
        row.addView(tokens.text(state, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));
        String note = text(applet, "note");
        if (note != null) row.addView(tokens.text(note, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));

        LinearLayout actions = new LinearLayout(context);
        actions.setGravity(android.view.Gravity.END);
        if (versions.size() > 1 || versions.size() == 1 && !versions.get(0).optString("version").equals(target)) {
            MaterialButton other = tokens.textButton("Install another version");
            other.setOnClickListener(v -> otherVersions(context, applet.optString("name", id), versions, version -> listener.choose(id, version)));
            actions.addView(other);
        }
        String primaryLabel = installed == null ? "Install" : installed.equals(target) ? "Reinstall" : "Install " + target;
        MaterialButton primary = tokens.button(primaryLabel, false);
        primary.setEnabled(target != null);
        String chosen = showPrereleases ? target : null;
        primary.setOnClickListener(v -> listener.choose(id, chosen));
        LinearLayout.LayoutParams primaryLayout = new LinearLayout.LayoutParams(-2, -2);
        primaryLayout.setMarginStart(tokens.dp(8));
        actions.addView(primary, primaryLayout);
        LinearLayout.LayoutParams actionsLayout = new LinearLayout.LayoutParams(-1, -2);
        actionsLayout.topMargin = tokens.dp(4);
        row.addView(actions, actionsLayout);
        return row;
    }

    private static void otherVersions(Context context, String name, List<JSONObject> versions, java.util.function.Consumer<String> choose) {
        String[] labels = new String[versions.size()];
        for (int i = 0; i < labels.length; i++) {
            JSONObject version = versions.get(i);
            labels[i] = version.optString("version") + (version.optBoolean("prerelease") ? " (prerelease)" : "");
        }
        new MaterialAlertDialogBuilder(context).setTitle(name)
            .setItems(labels, (d, index) -> choose.accept(versions.get(index).optString("version")))
            .setNegativeButton("Cancel", null).show();
    }

    /** The versions this Genesis can run, newest first; prereleases only when shown. */
    private static List<JSONObject> versions(JSONObject applet, boolean showPrereleases) {
        List<JSONObject> result = new ArrayList<>();
        JSONArray all = applet.optJSONArray("versions");
        for (int i = 0; all != null && i < all.length(); i++) {
            JSONObject version = all.optJSONObject(i);
            if (version == null || !version.optBoolean("compatible")) continue;
            if (version.optBoolean("prerelease") && !showPrereleases) continue;
            result.add(version);
        }
        return result;
    }

    private static boolean hasPrerelease(JSONArray applets) {
        for (int i = 0; i < applets.length(); i++) {
            JSONArray versions = applets.optJSONObject(i) == null ? null : applets.optJSONObject(i).optJSONArray("versions");
            for (int j = 0; versions != null && j < versions.length(); j++) {
                JSONObject version = versions.optJSONObject(j);
                if (version != null && version.optBoolean("prerelease")) return true;
            }
        }
        return false;
    }

    static String text(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key, null);
    }

    static LinearLayout column(Context context, Tokens tokens) {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), tokens.dp(8));
        return column;
    }

    static TextView body(Tokens tokens, String value) {
        TextView text = tokens.text(value, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant);
        text.setPadding(0, 0, 0, tokens.dp(8));
        return text;
    }

    private static LinearLayout.LayoutParams rowLayout(Tokens tokens) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.topMargin = tokens.dp(8);
        return layout;
    }
}
