package app.nirvana.genesis.ui;

import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * The review before anything installs: a new install, reinstall or downgrade (S08), an update
 * (S09, S09b), a replacement from another source (S10) and a blocked build (S11); and the
 * installed confirmation (S12).
 */
public final class Review {
    static final String REVIEW = "review", INSTALLED = "installed";

    private final Ui ui;
    private final Runnable finished;
    private JSONObject review;
    private boolean answered;
    private boolean eraseOnReplace = true;

    /** `finished` closes the pages of the flow that led here. */
    public Review(Ui ui, Runnable finished) {
        this.ui = ui;
        this.finished = finished;
    }

    public void show(JSONObject command) {
        review = command;
        answered = false;
        eraseOnReplace = true;
        ui.pages.push(REVIEW, this::page, () -> answer(false), false);
    }

    private void answer(boolean accept) {
        if (answered) return;
        answered = true;
        String kind = review.optJSONObject("outcome") == null ? "install" : review.optJSONObject("outcome").optString("kind");
        String replace = accept && "replace".equals(kind) ? (eraseOnReplace ? "erase" : "keep") : null;
        if (!"blocked".equals(kind) || !accept) ui.actions.reviewDecision(review.optString("reviewId"), accept, replace);
        ui.pages.remove(REVIEW);
        finished.run();
    }

    private View page() {
        Tokens t = ui.tokens;
        JSONObject outcome = review.optJSONObject("outcome");
        String kind = outcome == null ? "install" : outcome.optString("kind");
        View header = t.chromeHeader("Genesis review", null, () -> answer(false));
        switch (kind) {
            case "update": return ui.page(header, update(outcome), updateFooter());
            case "replace": return ui.page(header, replace(outcome), replaceFooter());
            case "blocked": return ui.page(header, blocked(outcome), blockedFooter());
            default: return ui.page(header, install(kind, outcome), installFooter(kind));
        }
    }

    private String name() { return review.optString("name"); }

    private String version() { return Ui.str(review, "version"); }

    private String title() { return name() + (version() != null ? " " + version() : ""); }

    private List<String> origins() { return Ui.strings(review.optJSONArray("origins")); }

    private List<String> services() {
        JSONObject capabilities = review.optJSONObject("capabilities");
        return capabilities == null ? new ArrayList<>() : Ui.strings(capabilities.optJSONArray("services"));
    }

    private boolean storage() {
        JSONObject capabilities = review.optJSONObject("capabilities");
        return capabilities != null && capabilities.optBoolean("storage");
    }

    // -----------------------------------------------------------------------------------------
    // S08: install, reinstall, downgrade

    private View install(String kind, JSONObject outcome) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(20), 0, t.dp(24));
        content.addView(identity());
        String lead;
        switch (kind) {
            case "reinstall": lead = "This is the version you have. Reinstalling replaces its files and keeps your data."; break;
            case "downgrade": lead = "You have " + outcome.optString("from") + ". This older version replaces it and keeps your data, which it may not understand."; break;
            default: lead = "Check what " + name() + " can reach before you install it.";
        }
        content.addView(ui.paragraph(lead, Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        content.addView(summary(), t.margins(20, 8));
        reach(content, origins(), services(), storage());
        trust(content);
        return content;
    }

    private View installFooter(String kind) {
        Tokens t = ui.tokens;
        String label;
        switch (kind) {
            case "reinstall": label = "Reinstall " + title(); break;
            case "downgrade": label = "Downgrade to " + version(); break;
            default: label = "Install " + title();
        }
        MaterialButton accept = t.button(label);
        accept.setOnClickListener(v -> answer(true));
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> answer(false));
        TextView note = t.text("You can remove it any time from Applet info.", Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
        note.setGravity(Gravity.CENTER);
        return ui.footer(note, accept, cancel);
    }

    private View identity() {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(t.dp(20), 0, t.dp(20), t.dp(8));
        row.addView(t.tile(name(), 56, false, false), new LinearLayout.LayoutParams(t.dp(56), t.dp(56)));
        LinearLayout text = ui.column();
        text.addView(t.heading(name(), Tokens.Type.TITLE_LARGE));
        String detail = (version() != null ? "Version " + version() + " · " : "") + Ui.sourceText(review.optString("sourceLabel"));
        text.addView(t.text(detail, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        row.addView(text, layout);
        return row;
    }

    /** "Runs on 2 websites · uses 1 outside service · keeps data on this phone". */
    private View summary() {
        Tokens t = ui.tokens;
        List<String> parts = new ArrayList<>();
        int sites = origins().size();
        parts.add("Runs on " + (sites == 1 ? Ui.host(origins().get(0)) : sites + " websites"));
        int count = services().size();
        if (count > 0) parts.add("uses " + (count == 1 ? "1 outside service" : count + " outside services"));
        if (storage()) parts.add("keeps data on this phone");
        return t.banner(R.drawable.ic_shield, null, String.join(" · ", parts), t.surfaceContainer, t.onSurface, 0);
    }

    /** WEBSITES, OUTSIDE SERVICES and DATA ON THIS PHONE. */
    private void reach(LinearLayout content, List<String> origins, List<String> services, boolean storage) {
        Tokens t = ui.tokens;
        content.addView(t.section("Websites"));
        for (String origin : origins) {
            content.addView(t.row(R.drawable.ic_website, Ui.host(origin), "Uses your sign-in on this site, and sees what you see there", null, false, t.onSurface, null));
        }
        if (!services.isEmpty()) {
            content.addView(t.section("Outside services"));
            for (String service : services) {
                content.addView(t.row(R.drawable.ic_services, service, "Sends data to a server the developer runs. Connected later in Service connections.", null, false, t.onSurface, null));
            }
        }
        content.addView(t.section("Data on this phone"));
        content.addView(t.row(R.drawable.ic_storage, storage ? "Keeps its own data on this phone" : "Keeps no data of its own",
            storage ? "Erased when you remove the applet" : null, null, false, t.onSurface, null));
    }

    /** The file check, warnings, the developer's notes, and identity and source. */
    private void trust(LinearLayout content) {
        Tokens t = ui.tokens;
        LinearLayout files = new LinearLayout(ui.activity);
        files.setGravity(Gravity.CENTER_VERTICAL);
        files.setPadding(t.dp(20), t.dp(16), t.dp(20), 0);
        files.addView(t.chip(Ui.str(review, "publisher") != null ? "Verified files" : "Files checked", Tokens.Chip.SUCCESS));
        String hash = Ui.str(review, "bundleSha256");
        if (hash != null) {
            TextView code = t.text("code hash " + Ui.shortHash(hash), Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
            code.setTypeface(Typeface.MONOSPACE);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.setMarginStart(t.dp(10));
            files.addView(code, layout);
        }
        content.addView(files);

        List<String> warnings = Ui.strings(review.optJSONArray("warnings"));
        for (String warning : warnings) {
            content.addView(t.banner(R.drawable.ic_warning, null, warning, t.warningContainer, t.onWarningContainer, 0), t.margins(20, 12));
        }
        String notes = Ui.str(review, "notes");
        if (notes != null) {
            content.addView(t.section("The developer says"));
            LinearLayout box = ui.column();
            box.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
            box.setBackground(t.outlined(t.surfaceContainerLow, t.outlineVariant, 14, false));
            box.addView(t.text(notes, Tokens.Type.BODY_MEDIUM, t.onSurface));
            TextView note = t.text("Written by the developer. Genesis hasn't checked it.", Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
            note.setPadding(0, t.dp(8), 0, 0);
            box.addView(note);
            content.addView(box, t.margins(20, 0));
        }
        content.addView(t.section("Identity and source"));
        content.addView(t.pair("Applet id", review.optString("appletId")));
        content.addView(t.pair("Source", Ui.sourceText(review.optString("sourceLabel"))));
        if (Ui.str(review, "publisher") != null) content.addView(t.pair("Publisher", review.optString("publisher")));
        String date = Ui.isoDate(Ui.str(review, "publishedAt"));
        if (date != null) content.addView(t.pair("Released", date));
        if (review.optLong("bundleBytes") > 0) content.addView(t.pair("Size", Ui.size(review.optLong("bundleBytes"))));
    }

    // -----------------------------------------------------------------------------------------
    // S09 and S09b: update

    private View update(JSONObject outcome) {
        Tokens t = ui.tokens;
        JSONObject previous = review.optJSONObject("previous");
        String from = Ui.str(outcome, "from") != null ? outcome.optString("from") : previous == null ? null : Ui.str(previous, "version");
        List<String> oldOrigins = previous == null ? new ArrayList<>() : Ui.strings(previous.optJSONArray("origins"));
        List<String> oldServices = previous == null ? new ArrayList<>() : Ui.strings(previous.optJSONArray("services"));
        boolean oldStorage = previous != null && previous.optBoolean("storage");
        List<String> newOrigins = new ArrayList<>(), keptOrigins = new ArrayList<>(), newServices = new ArrayList<>(), keptServices = new ArrayList<>();
        for (String origin : origins()) (oldOrigins.contains(origin) ? keptOrigins : newOrigins).add(origin);
        for (String service : services()) (oldServices.contains(service) ? keptServices : newServices).add(service);
        boolean gainsStorage = storage() && !oldStorage;

        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(20), 0, t.dp(24));
        content.addView(identity());
        content.addView(ui.paragraph("Update " + name() + (from != null ? " from " + from : "") + " to " + (version() != null ? version() : "this build") + ".",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        int changes = newOrigins.size() + newServices.size() + (gainsStorage ? 1 : 0);
        if (changes > 0) {
            LinearLayout box = ui.column();
            box.setPadding(0, t.dp(14), 0, t.dp(8));
            box.setBackground(t.outlined(t.warningContainer, t.onWarningContainer & 0x55ffffff, 16, false));
            TextView heading = t.text(changes == 1 ? "1 change needs your OK" : changes + " changes need your OK", Tokens.Type.TITLE_MEDIUM, t.onWarningContainer);
            heading.setPadding(t.dp(16), 0, t.dp(16), t.dp(4));
            box.addView(heading);
            for (String origin : newOrigins) box.addView(t.row(R.drawable.ic_website, "New site: " + Ui.host(origin), "It can use your sign-in there", null, false, t.onWarningContainer, null));
            for (String service : newServices) box.addView(t.row(R.drawable.ic_services, "New outside service: " + service, "Sends data to a server the developer runs", null, false, t.onWarningContainer, null));
            if (gainsStorage) box.addView(t.row(R.drawable.ic_storage, "Keeps data on this phone", "Erased when you remove the applet", null, false, t.onWarningContainer, null));
            content.addView(box, t.margins(20, 8));
        } else {
            content.addView(t.banner(R.drawable.ic_check_circle, "Nothing new to approve", "This version reaches the same sites and services as the one you have.",
                t.successContainer, t.onSuccessContainer, 0), t.margins(20, 8));
        }
        if (!keptOrigins.isEmpty() || !keptServices.isEmpty() || (storage() && oldStorage)) {
            content.addView(t.section("Unchanged"));
            for (String origin : keptOrigins) content.addView(t.row(R.drawable.ic_website, Ui.host(origin), null, null, false, t.onSurface, null));
            for (String service : keptServices) content.addView(t.row(R.drawable.ic_services, service, "Outside service", null, false, t.onSurface, null));
            if (storage() && oldStorage) content.addView(t.row(R.drawable.ic_storage, "Data on this phone", null, null, false, t.onSurface, null));
        }
        trust(content);
        return content;
    }

    private View updateFooter() {
        Tokens t = ui.tokens;
        MaterialButton accept = t.button(version() != null ? "Update to " + version() : "Update");
        accept.setOnClickListener(v -> answer(true));
        MaterialButton later = t.outlinedButton("Not now");
        later.setOnClickListener(v -> answer(false));
        TextView note = t.text("Your data is kept.", Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
        note.setGravity(Gravity.CENTER);
        return ui.footer(note, accept, later);
    }

    // -----------------------------------------------------------------------------------------
    // S10: replace

    private View replace(JSONObject outcome) {
        Tokens t = ui.tokens;
        JSONObject previous = review.optJSONObject("previous");
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(20), 0, t.dp(24));
        content.addView(identity());
        content.addView(t.banner(R.drawable.ic_warning, "Different source and publisher",
            name() + " is already installed from " + Ui.sourceText(outcome.optString("fromSource")) + ". This build comes from somewhere else, so Genesis treats it as a different applet.",
            t.errorContainer, t.onErrorContainer, 0), t.margins(20, 8));

        content.addView(t.section("What's different"));
        LinearLayout table = ui.column();
        table.setBackground(t.outlined(t.surface, t.outlineVariant, 14, false));
        table.addView(compareRow("", "Installed", "New build", false, true));
        String oldSource = previous != null && Ui.str(previous, "source") != null ? previous.optString("source") : outcome.optString("fromSource");
        compare(table, "Source", Ui.sourceText(oldSource), Ui.sourceText(review.optString("sourceLabel")));
        compare(table, "Publisher", previous == null ? null : Ui.str(previous, "publisher"), Ui.str(review, "publisher"));
        compare(table, "Websites", previous == null ? null : String.join("\n", Ui.hosts(Ui.strings(previous.optJSONArray("origins")))), String.join("\n", Ui.hosts(origins())));
        compare(table, "Services", previous == null ? null : String.join("\n", Ui.strings(previous.optJSONArray("services"))), String.join("\n", services()));
        content.addView(table, t.margins(20, 0));

        content.addView(t.section("Your data"));
        content.addView(choice("Erase and start fresh", "Recommended. The new build can't read what the old one saved.", true));
        content.addView(choice("Keep my data", "Only if you trust the new publisher with it.", false));
        trust(content);
        return content;
    }

    private void compare(LinearLayout table, String label, String before, String after) {
        String left = before == null || before.isEmpty() ? "None" : before, right = after == null || after.isEmpty() ? "None" : after;
        table.addView(ui.tokens.divider());
        table.addView(compareRow(label, left, right, !left.equals(right), false));
    }

    private View compareRow(String label, String left, String right, boolean differs, boolean head) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setPadding(t.dp(12), t.dp(10), t.dp(12), t.dp(10));
        Tokens.Type type = head ? Tokens.Type.LABEL_MEDIUM : Tokens.Type.BODY_SMALL;
        row.addView(t.text(label, Tokens.Type.LABEL_MEDIUM, t.onSurfaceVariant), new LinearLayout.LayoutParams(0, -2, 0.8f));
        row.addView(t.text(left, type, head ? t.onSurfaceVariant : t.onSurface), new LinearLayout.LayoutParams(0, -2, 1.1f));
        TextView value = t.text(right, type, head ? t.onSurfaceVariant : differs ? t.onErrorContainer : t.onSurface);
        if (differs) {
            value.setBackground(t.rounded(t.errorContainer, 6));
            value.setPadding(t.dp(6), t.dp(2), t.dp(6), t.dp(2));
        }
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1.1f);
        layout.setMarginStart(t.dp(6));
        row.addView(value, layout);
        if (!head) row.setContentDescription(label + ": installed " + left + ", new build " + right + (differs ? ", different" : ""));
        return row;
    }

    private View choice(String title, String detail, boolean erase) {
        Tokens t = ui.tokens;
        boolean checked = eraseOnReplace == erase;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(t.dp(8), t.dp(8), t.dp(20), t.dp(8));
        RadioButton radio = new RadioButton(ui.activity);
        radio.setChecked(checked);
        radio.setClickable(false);
        radio.setFocusable(false);
        radio.setButtonTintList(ColorStateList.valueOf(checked ? t.primary : t.outline));
        row.addView(radio, new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        LinearLayout text = ui.column();
        text.addView(t.text(title, Tokens.Type.TITLE_MEDIUM, t.onSurface));
        text.addView(t.text(detail, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
        row.setBackground(t.pressable(Color.TRANSPARENT, 0, 0));
        row.setClickable(true);
        row.setContentDescription(title + ". " + detail + (checked ? ", selected" : ""));
        row.setOnClickListener(v -> {
            eraseOnReplace = erase;
            ui.pages.push(REVIEW, this::page, () -> answer(false), false);
        });
        return row;
    }

    private View replaceFooter() {
        Tokens t = ui.tokens;
        MaterialButton accept = eraseOnReplace ? t.dangerButton("Replace and erase data") : t.button("Replace and keep data");
        accept.setOnClickListener(v -> answer(true));
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> answer(false));
        return ui.footer(accept, cancel);
    }

    // -----------------------------------------------------------------------------------------
    // S11: blocked

    private View blocked(JSONObject outcome) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.notice(t.circleIcon(R.drawable.ic_block, t.errorContainer, t.onErrorContainer, 68), "Cause: Applet",
            "Genesis blocked " + title(), "This build breaks a rule every applet must follow, so Genesis won't install it.");
        TextView finding = t.section("Finding");
        finding.setPadding(0, t.dp(24), 0, t.dp(8));
        content.addView(finding);
        LinearLayout box = ui.column();
        box.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        box.setBackground(t.outlined(t.errorContainer, t.onErrorContainer & 0x44ffffff, 14, false));
        box.addView(t.text(outcome.optString("reason"), Tokens.Type.BODY_MEDIUM, t.onErrorContainer));
        content.addView(box);
        TextView next = t.section("What happens now");
        next.setPadding(0, t.dp(24), 0, t.dp(8));
        content.addView(next);
        LinearLayout card = ui.column();
        card.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        card.setBackground(t.rounded(t.surfaceContainer, 14));
        card.addView(t.text("Nothing was installed and nothing on your phone changed. If you already have " + name() + ", it keeps working as before.",
            Tokens.Type.BODY_MEDIUM, t.onSurface));
        content.addView(card);
        MaterialButton why = t.linkButton("Why does Genesis block this?");
        why.setOnClickListener(v -> ui.pages.push("control", () -> Settings.control(ui), null, false));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
        layout.topMargin = t.dp(8);
        content.addView(why, layout);
        return content;
    }

    private View blockedFooter() {
        Tokens t = ui.tokens;
        MaterialButton home = t.button("Back to Home");
        home.setOnClickListener(v -> answer(false));
        String repo = Ui.repositoryOf(review.optString("sourceLabel"));
        MaterialButton tell = null;
        if (repo != null) {
            tell = t.outlinedButton("Tell the developer");
            tell.setOnClickListener(v -> ui.actions.openExternal("https://github.com/" + repo + "/issues"));
        }
        return ui.footer(home, tell);
    }

    // -----------------------------------------------------------------------------------------
    // S12: installed

    public void installed(JSONObject command) {
        ui.pages.push(INSTALLED, () -> installedPage(command), () -> ui.pages.remove(INSTALLED), false);
    }

    private View installedPage(JSONObject command) {
        Tokens t = ui.tokens;
        String name = command.optString("name"), version = Ui.str(command, "version"), id = command.optString("appletId");
        boolean updated = command.optBoolean("updated");
        List<String> hosts = Ui.hosts(Ui.strings(command.optJSONArray("origins")));
        LinearLayout content = ui.column();
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(t.dp(24), t.dp(48), t.dp(24), t.dp(24));
        content.addView(ui.badgedTile(name, 88), new LinearLayout.LayoutParams(t.dp(88), t.dp(88)));
        TextView heading = t.heading(name + (updated ? " is updated" : " is installed"), Tokens.Type.HEADLINE);
        heading.setGravity(Gravity.CENTER);
        heading.setPadding(0, t.dp(28), 0, t.dp(8));
        content.addView(heading);
        String detail = (version != null ? "Version " + version : "") + (hosts.isEmpty() ? "" : (version != null ? " · " : "") + "runs on " + Ui.and(hosts));
        TextView line = t.text(detail, Tokens.Type.BODY_LARGE, t.onSurfaceVariant);
        line.setGravity(Gravity.CENTER);
        content.addView(line);

        LinearLayout card = new LinearLayout(ui.activity);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        card.setBackground(t.rounded(t.surfaceContainer, 16));
        TextView mark = t.text("G", Tokens.Type.TITLE_MEDIUM, Color.WHITE);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(t.rounded(t.chrome, 18));
        card.addView(mark, new LinearLayout.LayoutParams(t.dp(36), t.dp(36)));
        TextView text = t.text("While " + name + " is open, the Genesis button at the top takes you Home, shows the real website, or opens Applet info.",
            Tokens.Type.BODY_MEDIUM, t.onSurface);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        card.addView(text, layout);
        content.addView(card, t.margins(0, 32));

        MaterialButton open = t.button("Open " + name);
        open.setOnClickListener(v -> {
            ui.pages.remove(INSTALLED);
            ui.actions.openApplet(id);
        });
        MaterialButton done = t.outlinedButton("Done");
        done.setOnClickListener(v -> ui.pages.remove(INSTALLED));
        return ui.page(null, content, ui.footer(open, done));
    }
}
