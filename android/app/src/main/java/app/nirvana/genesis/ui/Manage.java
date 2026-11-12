package app.nirvana.genesis.ui;

import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.google.android.material.materialswitch.MaterialSwitch;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/** Updates (S13), Applet info (S14) and removing an applet (S16). */
public final class Manage {
    static final String UPDATES = "updates", INFO = "info:";

    private final Ui ui;
    private final AddFlow add;
    private final Connections connections;

    public Manage(Ui ui, AddFlow add, Connections connections) {
        this.ui = ui;
        this.add = add;
        this.connections = connections;
    }

    // -----------------------------------------------------------------------------------------
    // S13

    public void updates() {
        ui.pages.push(UPDATES, this::updatesPage, null, true);
    }

    private View updatesPage() {
        Tokens t = ui.tokens;
        List<JSONObject> review = new ArrayList<>(), plain = new ArrayList<>(), newer = new ArrayList<>(), withdrawn = new ArrayList<>();
        for (JSONObject entry : ui.entries()) {
            JSONObject update = entry.optJSONObject("update");
            if (update == null) continue;
            if (update.optBoolean("withdrawn")) withdrawn.add(entry);
            else if (Ui.str(update, "version") != null) (Home.needsReview(update) ? review : plain).add(entry);
            else if (Ui.str(update, "incompatible") != null) newer.add(entry);
        }
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(4), 0, t.dp(24));
        if (review.isEmpty() && plain.isEmpty() && newer.isEmpty() && withdrawn.isEmpty()) {
            content.addView(ui.notice(t.circleIcon(R.drawable.ic_check, t.successContainer, t.onSuccessContainer, 68), null,
                "Everything is up to date", "Genesis checks your applets from GitHub for new releases. Applets from a file or a development build update when you add them again."));
        }
        if (!review.isEmpty()) {
            content.addView(t.section("Needs your review"));
            for (JSONObject entry : review) {
                JSONObject update = entry.optJSONObject("update");
                List<String> asks = new ArrayList<>();
                for (String origin : Ui.strings(update.optJSONArray("newOrigins"))) asks.add("new site " + Ui.host(origin));
                for (String service : Ui.strings(update.optJSONArray("newServices"))) asks.add("new service " + service);
                if (update.optBoolean("gainsStorage")) asks.add("keeps data on this phone");
                MaterialButton button = t.smallButton("Review", true);
                button.setOnClickListener(v -> ui.actions.checkUpdates(entry.optString("appletId"), true));
                content.addView(item(entry, arrow(entry, update) + " · asks for " + Ui.and(asks), button));
            }
        }
        if (!plain.isEmpty()) {
            content.addView(t.section("Nothing new to approve"));
            for (JSONObject entry : plain) {
                MaterialButton button = t.smallButton("Update", false);
                button.setOnClickListener(v -> ui.actions.checkUpdates(entry.optString("appletId"), true));
                content.addView(item(entry, arrow(entry, entry.optJSONObject("update")) + " · same sites and services", button));
            }
        }
        if (!newer.isEmpty()) {
            content.addView(t.section("Needs a newer Genesis"));
            for (JSONObject entry : newer) {
                content.addView(item(entry, entry.optJSONObject("update").optString("incompatible") + " is out, but it needs a newer Genesis than this one. Your version keeps working.", null));
            }
        }
        if (!withdrawn.isEmpty()) {
            content.addView(t.section("Release withdrawn"));
            for (JSONObject entry : withdrawn) {
                JSONObject update = entry.optJSONObject("update");
                String offered = Ui.str(update, "version");
                String installed = Ui.str(entry, "version");
                LinearLayout box = ui.column();
                box.addView(item(entry, "The publisher withdrew " + (installed != null ? installed : "this release") + ". "
                    + (offered != null ? offered + " is offered instead." : "No other release is offered."), null));
                LinearLayout buttons = new LinearLayout(ui.activity);
                buttons.setPadding(t.dp(84), 0, t.dp(20), t.dp(12));
                if (offered != null) {
                    MaterialButton install = t.smallButton("Install " + offered, true);
                    install.setOnClickListener(v -> ui.actions.checkUpdates(entry.optString("appletId"), true));
                    buttons.addView(install);
                }
                MaterialButton keep = t.smallButton("Keep " + (installed != null ? installed : "this version"), false);
                keep.setOnClickListener(v -> ui.actions.keepVersion(entry.optString("appletId")));
                LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
                layout.setMarginStart(offered != null ? t.dp(8) : 0);
                buttons.addView(keep, layout);
                box.addView(buttons);
                content.addView(box);
            }
        }

        LinearLayout footer = new LinearLayout(ui.activity);
        footer.setGravity(Gravity.CENTER_VERTICAL);
        footer.setPadding(t.dp(20), t.dp(8), t.dp(8), t.dp(8));
        String checked = ui.updatesCheckedAt > 0 ? "Checked " + Ui.ago(ui.updatesCheckedAt) : "Not checked yet";
        footer.addView(t.text(checked, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant), new LinearLayout.LayoutParams(0, -2, 1));
        MaterialButton now = t.linkButton("Check now");
        now.setOnClickListener(v -> ui.actions.checkUpdates(null, true));
        footer.addView(now);
        return ui.page(t.header("Updates", false, ui.pages::pop), content, footer);
    }

    private static String arrow(JSONObject entry, JSONObject update) {
        String from = Ui.str(entry, "version"), to = Ui.str(update, "version");
        return (from != null ? from + " → " : "") + (to != null ? to : "");
    }

    private View item(JSONObject entry, String detail, View trailing) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(t.dp(20), t.dp(10), t.dp(20), t.dp(10));
        row.addView(t.appletTile(entry.optString("name"), Ui.str(entry, "icon"), 48, false, false), new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        LinearLayout text = ui.column();
        text.addView(t.text(entry.optString("name"), Tokens.Type.TITLE_MEDIUM, t.onSurface));
        text.addView(t.text(detail, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(16));
        layout.setMarginEnd(t.dp(8));
        row.addView(text, layout);
        if (trailing != null) row.addView(trailing);
        return row;
    }

    // -----------------------------------------------------------------------------------------
    // S14

    public void info(String appletId) {
        ui.pages.push(INFO + appletId, () -> infoPage(appletId), null, true);
    }

    private View infoPage(String appletId) {
        Tokens t = ui.tokens;
        JSONObject entry = ui.entry(appletId);
        if (entry == null) return null;
        String name = entry.optString("name");
        boolean incompatible = "incompatible".equals(entry.optString("status"));
        boolean dev = "dev".equals(entry.optString("sourceKind"));
        JSONObject update = entry.optJSONObject("update");
        String offered = update == null || update.optBoolean("withdrawn") ? null : Ui.str(update, "version");

        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(20), 0, t.dp(32));
        LinearLayout top = new LinearLayout(ui.activity);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(t.dp(20), 0, t.dp(20), 0);
        top.addView(t.appletTile(name, Ui.str(entry, "icon"), 64, dev, incompatible), new LinearLayout.LayoutParams(t.dp(64), t.dp(64)));
        LinearLayout text = ui.column();
        text.addView(t.heading(name, Tokens.Type.TITLE_LARGE));
        text.addView(t.text(Home.versionLine(entry), Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        if (offered != null) {
            LinearLayout.LayoutParams chip = new LinearLayout.LayoutParams(-2, -2);
            chip.topMargin = t.dp(6);
            text.addView(t.chip("Update " + offered + " ready", Tokens.Chip.INFO), chip);
        } else if (incompatible) {
            LinearLayout.LayoutParams chip = new LinearLayout.LayoutParams(-2, -2);
            chip.topMargin = t.dp(6);
            text.addView(t.chip("Can't run", Tokens.Chip.WARNING), chip);
        }
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(16));
        top.addView(text, layout);
        content.addView(top);

        LinearLayout buttons = new LinearLayout(ui.activity);
        buttons.setPadding(t.dp(20), t.dp(20), t.dp(20), 0);
        MaterialButton open = t.button("Open");
        open.setOnClickListener(v -> ui.actions.openApplet(appletId));
        buttons.addView(open, new LinearLayout.LayoutParams(0, -2, 1));
        if (offered != null) {
            MaterialButton review = t.outlinedButton("Review update");
            review.setOnClickListener(v -> ui.actions.checkUpdates(appletId, true));
            LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(0, -2, 1);
            second.setMarginStart(t.dp(12));
            buttons.addView(review, second);
        }
        content.addView(buttons);

        List<String> origins = Ui.strings(entry.optJSONArray("origins"));
        if (!origins.isEmpty()) {
            content.addView(t.section("Websites"));
            boolean separate = ui.actions.separateSignIn(appletId);
            String use = separate ? "Uses its own sign-in on this site" : "Uses your sign-in on this site";
            for (String origin : origins) content.addView(t.row(R.drawable.ic_website, Ui.host(origin), use, null, false, t.onSurface, null));
            if (ui.actions.separateSignInAvailable()) content.addView(separateSignIn(entry, separate));
        }
        List<String> services = Ui.strings(entry.optJSONArray("services"));
        if (!services.isEmpty()) {
            content.addView(t.section("Outside services"));
            Connections.Store store = ui.actions.connections();
            for (String service : services) {
                Connections.Status status = store.status(appletId, service);
                TextView chip = status.failure != null ? t.chip("Last request failed", Tokens.Chip.DANGER)
                    : status.connected ? t.chip("Connected", Tokens.Chip.SUCCESS) : t.chip("Not connected", Tokens.Chip.NEUTRAL);
                content.addView(t.row(R.drawable.ic_services, service, status.connected ? Ui.host(status.address) : null, chip, true, t.onSurface,
                    () -> connections.open(appletId)));
            }
        }

        content.addView(t.section("Details"));
        if (Ui.str(entry, "publisher") != null) content.addView(t.pair("Publisher", entry.optString("publisher")));
        content.addView(t.pair("Source", Ui.sourceText(Ui.str(entry, "source"))));
        if (Ui.str(entry, "path") != null && !".".equals(entry.optString("path"))) content.addView(t.pair("Folder", "/" + entry.optString("path")));
        if (entry.has("installedAt")) content.addView(t.pair("Installed", Ui.date(entry.optLong("installedAt"))));
        if (Ui.str(entry, "bundleSha256") != null) content.addView(t.pair("Files", "Checked · " + Ui.shortHash(entry.optString("bundleSha256"))));
        content.addView(t.pair("Storage", entry.optBoolean("storage") ? "Keeps data on this phone" : "None"));
        content.addView(t.pair("Applet id", appletId));

        content.addView(t.section("Manage"));
        if ("github".equals(entry.optString("sourceKind"))) {
            content.addView(t.row(R.drawable.ic_branch, "Change version", "Install an earlier or newer release", null, true, t.onSurface, () -> add.changeVersion(entry)));
        }
        if (!services.isEmpty()) {
            content.addView(t.row(R.drawable.ic_services, "Service connections", "Addresses and tokens for outside services", null, true, t.onSurface, () -> connections.open(appletId)));
        }
        if (entry.optBoolean("storage")) {
            content.addView(t.row(R.drawable.ic_storage, "Clear data…", "Erase what " + name + " saved, keep the applet", null, false, t.onSurface, () -> confirmClear(entry)));
        }
        content.addView(t.row(R.drawable.ic_delete, "Remove applet…", null, null, false, t.danger, () -> remove(appletId)));
        return ui.page(t.header("Applet info", false, () -> ui.pages.remove(INFO + appletId)), content, null);
    }

    /** "Use a separate sign-in". Turning it off asks first, because it signs the applet out. */
    private View separateSignIn(JSONObject entry, boolean on) {
        Tokens t = ui.tokens;
        String appletId = entry.optString("appletId"), name = entry.optString("name");
        MaterialSwitch toggle = new MaterialSwitch(ui.activity);
        toggle.setChecked(on);
        toggle.setContentDescription("Use a separate sign-in");
        toggle.setOnCheckedChangeListener((button, checked) -> {
            if (checked) { ui.actions.setSeparateSignIn(appletId, true); return; }
            new MaterialAlertDialogBuilder(ui.activity)
                .setTitle("Sign " + name + " out of its separate sign-in?")
                .setMessage(name + " goes back to the sign-in your other applets use. What it signed in to on its own is deleted.")
                .setNegativeButton("Cancel", (dialog, which) -> toggle.setChecked(true))
                .setOnCancelListener(dialog -> toggle.setChecked(true))
                .setPositiveButton("Sign out", (dialog, which) -> ui.actions.setSeparateSignIn(appletId, false))
                .show();
        });
        return t.row(R.drawable.ic_lock, "Use a separate sign-in", "This applet signs in to its websites on its own. Other applets stay as they are.",
            toggle, false, t.onSurface, null);
    }

    private void confirmClear(JSONObject entry) {
        String name = entry.optString("name");
        new MaterialAlertDialogBuilder(ui.activity)
            .setTitle("Clear " + name + " data?")
            .setMessage("This erases everything " + name + " saved on this phone. The applet, your website sign-ins and service connections stay.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Clear data", (dialog, which) -> ui.actions.clearData(entry.optString("appletId")))
            .show();
    }

    // -----------------------------------------------------------------------------------------
    // S16

    public void remove(String appletId) {
        Tokens t = ui.tokens;
        JSONObject entry = ui.entry(appletId);
        if (entry == null) return;
        String name = entry.optString("name");
        LinearLayout content = ui.column();
        content.setPadding(t.dp(20), 0, t.dp(20), t.dp(20));
        LinearLayout top = new LinearLayout(ui.activity);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(t.tile(name, 48, false, false), new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        TextView title = t.heading("Remove " + name + "?", Tokens.Type.TITLE_LARGE);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        top.addView(title, layout);
        content.addView(top);

        List<String> erased = new ArrayList<>();
        erased.add("Its screens and files");
        if (entry.optBoolean("storage")) erased.add("Everything it saved on this phone");
        if (entry.has("services")) erased.add("Its service addresses and tokens");
        LinearLayout card = ui.column();
        card.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        card.setBackground(t.rounded(t.errorContainer, 14));
        card.addView(t.text("Also erased", Tokens.Type.TITLE_MEDIUM, t.onErrorContainer));
        for (String item : erased) card.addView(t.text("• " + item, Tokens.Type.BODY_MEDIUM, t.onErrorContainer));
        content.addView(card, t.margins(0, 16));
        List<String> hosts = Ui.hosts(Ui.strings(entry.optJSONArray("origins")));
        String sites = hosts.isEmpty() ? "the websites it used" : Ui.and(hosts);
        String signIn = ui.actions.separateSignIn(appletId) ? "Its separate sign-in to " + sites + " is deleted with it."
            : "You stay signed in to " + sites + ". Sign out in Settings › Sites & sign-ins.";
        content.addView(t.text(signIn, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant), t.margins(0, 14));

        BottomSheetDialog[] dialog = new BottomSheetDialog[1];
        MaterialButton remove = t.dangerButton("Remove and erase");
        remove.setOnClickListener(v -> {
            dialog[0].dismiss();
            ui.pages.remove(INFO + appletId);
            ui.pages.remove(Connections.TAG + appletId);
            ui.actions.removeApplet(appletId);
        });
        content.addView(remove, t.margins(0, 20));
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> dialog[0].dismiss());
        content.addView(cancel, t.margins(0, 12));
        dialog[0] = ui.sheet(content);
    }
}
