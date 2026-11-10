package app.nirvana.genesis.ui;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Typeface;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.snackbar.Snackbar;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Full-screen notices: an applet that stopped (S21), one that can't run on this Genesis (S23),
 * no connection (S26) and a WebView too old for Genesis (S27); and the import snackbar.
 */
public final class Notices {
    static final String STOPPED = "stopped", CANT_RUN = "cantRun:", OFFLINE = "offline", WEBVIEW = "webview";
    private static final String REBUILD = "genesis-applet build <dir> && genesis-applet dev install <dir>";

    private final Ui ui;
    private final AddFlow add;

    public Notices(Ui ui, AddFlow add) {
        this.ui = ui;
        this.add = add;
    }

    // -----------------------------------------------------------------------------------------
    // S21

    public void stopped(JSONObject entry) {
        ui.pages.push(STOPPED, () -> stoppedPage(entry), null, false);
    }

    private View stoppedPage(JSONObject entry) {
        Tokens t = ui.tokens;
        String name = entry == null ? "The applet" : entry.optString("name");
        String version = entry == null ? null : Ui.str(entry, "version");
        View header = t.chromeHeader("Genesis", entry == null ? null : name + (version != null ? " " + version : ""), null);
        LinearLayout content = ui.notice(t.circleIcon(R.drawable.ic_stop, t.errorContainer, t.onErrorContainer, 68), null,
            name + " stopped", "Its pages stopped responding, so Genesis closed them. Nothing you saved is lost. Reload opens " + name + " again where you were.");
        MaterialButton reload = entry == null ? null : t.button("Reload " + name);
        if (reload != null) reload.setOnClickListener(v -> {
            ui.pages.remove(STOPPED);
            ui.actions.openApplet(entry.optString("appletId"));
        });
        MaterialButton home = t.outlinedButton("Go to Home");
        home.setOnClickListener(v -> ui.pages.remove(STOPPED));
        return ui.page(header, content, ui.footer(reload, home));
    }

    // -----------------------------------------------------------------------------------------
    // S23 and S23b

    public void cantRun(JSONObject entry, String details) {
        if (entry == null) return;
        String id = entry.optString("appletId");
        ui.pages.push(CANT_RUN + id, () -> cantRunPage(id, entry, details), null, true);
    }

    private View cantRunPage(String id, JSONObject fallback, String details) {
        Tokens t = ui.tokens;
        JSONObject entry = ui.entry(id) != null ? ui.entry(id) : fallback;
        if (!"incompatible".equals(entry.optString("status"))) return null;
        String name = entry.optString("name");
        String direction = entry.optString("direction");
        boolean newer = "newer".equals(direction), mixed = "mixed".equals(direction);
        boolean dev = "dev".equals(entry.optString("sourceKind")), github = "github".equals(entry.optString("sourceKind"));
        String body = newer ? name + " needs a newer Genesis than the one on this phone. Update Genesis, then open " + name + " again."
            : mixed ? name + " was built for a different Genesis. It needs both a newer Genesis and a rebuild of the applet."
            : name + " was built for an older Genesis. Its developer needs to publish a build for this one.";
        LinearLayout content = ui.notice(t.tile(name, 68, dev, true), newer ? "Cause: Genesis" : "Cause: Applet", name + " can't run", body);

        JSONArray mismatches = entry.optJSONArray("mismatches");
        if (mismatches != null && mismatches.length() > 0) {
            content.addView(table(mismatches), t.margins(0, 20));
        } else if (details != null && !details.isEmpty()) {
            content.addView(t.text(details, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant), t.margins(0, 16));
        }
        if (dev && !newer) {
            content.addView(t.text("Rebuild it on your computer and install it again:", Tokens.Type.BODY_MEDIUM, t.onSurface), t.margins(0, 20));
            content.addView(t.commandBox(REBUILD), t.margins(0, 8));
        }
        content.addView(t.banner(R.drawable.ic_storage, null, "Your " + name + " data is kept while it waits.", t.surfaceContainer, t.onSurfaceVariant, 0), t.margins(0, 20));

        MaterialButton check = null, other = null;
        if (github) {
            check = t.button("Check for updates");
            check.setOnClickListener(v -> ui.actions.checkUpdates(id, true));
            other = t.outlinedButton("Use another version");
            other.setOnClickListener(v -> add.changeVersion(entry));
        }
        MaterialButton home = t.outlinedButton("Go to Home");
        home.setOnClickListener(v -> ui.pages.remove(CANT_RUN + id));
        return ui.page(t.header("Can't run", false, () -> ui.pages.remove(CANT_RUN + id)), content, ui.footer(check, other, github ? null : home));
    }

    /** Each mismatched version as "field  applet → Genesis", read aloud as "field: applet 5, Genesis 6". */
    private View table(JSONArray mismatches) {
        Tokens t = ui.tokens;
        LinearLayout table = ui.column();
        table.setBackground(t.rounded(t.surfaceContainer, 12));
        table.setPadding(t.dp(16), t.dp(10), t.dp(16), t.dp(10));
        LinearLayout header = new LinearLayout(ui.activity);
        header.addView(t.text("What differs", Tokens.Type.LABEL_MEDIUM, t.onSurfaceVariant), new LinearLayout.LayoutParams(0, -2, 1));
        header.addView(t.text("Applet → Genesis", Tokens.Type.LABEL_MEDIUM, t.onSurfaceVariant));
        header.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        table.addView(header);
        for (int i = 0; i < mismatches.length(); i++) {
            JSONObject mismatch = mismatches.optJSONObject(i);
            if (mismatch == null) continue;
            String field = mismatch.optString("field"), applet = mismatch.optString("applet"), host = mismatch.optString("host");
            LinearLayout row = new LinearLayout(ui.activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setMinimumHeight(t.dp(32));
            TextView name = t.text(field, Tokens.Type.BODY_MEDIUM, t.onSurface);
            name.setTypeface(Typeface.MONOSPACE);
            row.addView(name, new LinearLayout.LayoutParams(0, -2, 1));
            row.addView(t.text(applet + " → " + host, Tokens.Type.BODY_MEDIUM, t.onSurface));
            row.setFocusable(true);
            row.setContentDescription(field + ": applet " + applet + ", Genesis " + host);
            table.addView(row);
        }
        return table;
    }

    /** An imported applet that this Genesis can't run: a snackbar whose Details opens S23. */
    public void imported(JSONObject entry, String details) {
        if (entry == null) return;
        String name = entry.optString("name");
        Snackbar.make(ui.activity.findViewById(android.R.id.content), name + " can't run on this Genesis", Snackbar.LENGTH_LONG)
            .setAction("Details", v -> cantRun(entry, details))
            .show();
    }

    // -----------------------------------------------------------------------------------------
    // S26

    public void offline(String appletId) {
        JSONObject entry = ui.entry(appletId);
        String name = entry == null ? "This applet" : entry.optString("name");
        ui.pages.push(OFFLINE, () -> {
            Tokens t = ui.tokens;
            LinearLayout content = ui.notice(t.circleIcon(R.drawable.ic_wifi_off, t.surfaceContainerHigh, t.onSurfaceVariant, 68), null,
                "You're offline", name + " runs on live websites, so it needs a connection. Connect to Wi-Fi or mobile data and try again.");
            MaterialButton retry = t.button("Retry");
            retry.setOnClickListener(v -> {
                ui.pages.remove(OFFLINE);
                ui.actions.openApplet(appletId);
            });
            MaterialButton home = t.outlinedButton("Go to Home");
            home.setOnClickListener(v -> ui.pages.remove(OFFLINE));
            return ui.page(t.chromeHeader("Genesis", null, null), content, ui.footer(retry, home));
        }, null, false);
    }

    // -----------------------------------------------------------------------------------------
    // S27

    /** Shown instead of everything else when the system WebView can't run Genesis. */
    public static View webViewTooOld(Ui ui, String version) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.notice(t.circleIcon(R.drawable.ic_phone, t.warningContainer, t.onWarningContainer, 68), null,
            "Update Android System WebView", "Genesis shows websites through Android System WebView. The version on this phone"
                + (version != null ? " (" + version + ")" : "") + " is too old to run applets safely. Update it from Google Play, then open Genesis again.");
        MaterialButton update = t.button("Open Google Play");
        update.setOnClickListener(v -> {
            try {
                ui.activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.webview")));
            } catch (ActivityNotFoundException error) {
                ui.actions.openExternal("https://play.google.com/store/apps/details?id=com.google.android.webview");
            }
        });
        return ui.page(t.chromeHeader("Genesis", null, null), content, ui.footer(update));
    }
}
