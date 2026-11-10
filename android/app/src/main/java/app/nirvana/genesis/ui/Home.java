package app.nirvana.genesis.ui;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.floatingactionbutton.ExtendedFloatingActionButton;
import android.content.res.ColorStateList;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.json.JSONObject;

/** The launcher (S01, S02), the applet's long-press sheet (S03) and the Add sheet (S04). */
public final class Home {
    /** Opens other screens from Home. */
    public interface Navigator {
        void settings();
        void updates();
        void info(String appletId);
        void addFromRepository();
        void control();
        void remove(String appletId);
    }

    private final Ui ui;
    private final Navigator navigator;
    private final SharedPreferences prefs;
    public final FrameLayout root;

    public Home(Ui ui, Navigator navigator) {
        this.ui = ui;
        this.navigator = navigator;
        prefs = ui.activity.getSharedPreferences("genesis.home", Context.MODE_PRIVATE);
        root = new FrameLayout(ui.activity);
    }

    /** An update the user must look at: new sites, outside services or storage. */
    public static boolean needsReview(JSONObject update) {
        return update != null && (update.has("newOrigins") || update.has("newServices") || update.optBoolean("gainsStorage"));
    }

    /** An offered update with nothing new to approve. */
    public static boolean plainUpdate(JSONObject entry) {
        JSONObject update = entry.optJSONObject("update");
        return update != null && !update.optBoolean("withdrawn") && Ui.str(update, "version") != null && !needsReview(update);
    }

    public static boolean hasUpdate(JSONObject entry) {
        JSONObject update = entry.optJSONObject("update");
        return update != null && (Ui.str(update, "version") != null || update.optBoolean("withdrawn") || Ui.str(update, "incompatible") != null);
    }

    public void render() {
        Tokens t = ui.tokens;
        root.removeAllViews();
        root.setBackgroundColor(t.surface);
        List<JSONObject> entries = ui.entries();
        LinearLayout column = ui.column();
        column.addView(topBar());
        column.addView(t.divider(), new LinearLayout.LayoutParams(-1, Math.max(1, t.dp(1))));
        if (entries.isEmpty()) {
            column.addView(empty(), new LinearLayout.LayoutParams(-1, 0, 1));
            root.addView(column, new FrameLayout.LayoutParams(-1, -1));
            return;
        }
        LinearLayout content = ui.column();
        content.setPadding(0, 0, 0, t.dp(120));
        View updates = updatesCard(entries);
        if (updates != null) content.addView(updates, t.margins(16, 8));
        View attention = attention(entries);
        if (attention != null) content.addView(attention, t.margins(16, 12));
        content.addView(sortRow(entries.size()));
        content.addView(grid(sorted(entries)), t.margins(12, 4));
        TextView hint = t.text("Long-press an applet for info, updates or remove.", Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
        hint.setGravity(Gravity.CENTER);
        content.addView(hint, t.margins(16, 20));
        ScrollView scroll = new ScrollView(ui.activity);
        scroll.addView(content);
        column.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(column, new FrameLayout.LayoutParams(-1, -1));

        ExtendedFloatingActionButton fab = new ExtendedFloatingActionButton(ui.activity);
        fab.setText("Add applet");
        fab.setIconResource(R.drawable.ic_add);
        fab.setAllCaps(false);
        fab.setBackgroundTintList(ColorStateList.valueOf(t.primary));
        fab.setTextColor(t.onPrimary);
        fab.setIconTint(ColorStateList.valueOf(t.onPrimary));
        fab.setOnClickListener(v -> addSheet());
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.END);
        layout.setMargins(0, 0, t.dp(20), t.dp(24));
        root.addView(fab, layout);
    }

    private View topBar() {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(t.dp(64));
        row.setPadding(t.dp(20), 0, t.dp(8), 0);
        row.addView(t.logo(32, false), new LinearLayout.LayoutParams(t.dp(32), t.dp(32)));
        TextView title = t.heading("Genesis", Tokens.Type.TITLE_LARGE);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(12));
        row.addView(title, layout);
        View link = t.iconButton(R.drawable.ic_link, t.onSurface, "Open a link");
        link.setOnClickListener(v -> ui.actions.openLink());
        row.addView(link, new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        View settings = t.iconButton(R.drawable.ic_tune, t.onSurface, "Settings");
        settings.setOnClickListener(v -> navigator.settings());
        row.addView(settings, new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        return row;
    }

    private View updatesCard(List<JSONObject> entries) {
        Tokens t = ui.tokens;
        int review = 0, plain = 0, withdrawn = 0;
        for (JSONObject entry : entries) {
            JSONObject update = entry.optJSONObject("update");
            if (update == null) continue;
            if (update.optBoolean("withdrawn")) withdrawn++;
            else if (Ui.str(update, "version") == null) continue;
            else if (needsReview(update)) review++;
            else plain++;
        }
        int total = review + plain + withdrawn;
        if (total == 0) return null;
        List<String> parts = new ArrayList<>();
        if (review > 0) parts.add(review + " need" + (review == 1 ? "s" : "") + " your review");
        if (plain > 0) parts.add(plain + " with nothing new to approve");
        if (withdrawn > 0) parts.add(withdrawn + " release withdrawn");
        LinearLayout card = new LinearLayout(ui.activity);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(t.dp(16), t.dp(14), t.dp(12), t.dp(14));
        card.setBackground(t.pressable(t.secondaryContainer, 16, 16));
        card.addView(t.circleIcon(R.drawable.ic_reload, t.primary, t.onPrimary, 40), new LinearLayout.LayoutParams(t.dp(40), t.dp(40)));
        LinearLayout text = ui.column();
        text.addView(t.text(total == 1 ? "1 update ready" : total + " updates ready", Tokens.Type.TITLE_MEDIUM, t.onSecondaryContainer));
        text.addView(t.text(capitalize(String.join(" · ", parts)), Tokens.Type.BODY_MEDIUM, t.onSecondaryContainer));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        card.addView(text, layout);
        card.addView(t.icon(R.drawable.ic_chevron, t.onSecondaryContainer), new LinearLayout.LayoutParams(t.dp(20), t.dp(20)));
        card.setClickable(true);
        card.setOnClickListener(v -> navigator.updates());
        return card;
    }

    private View attention(List<JSONObject> entries) {
        Tokens t = ui.tokens;
        List<String> cantRun = new ArrayList<>();
        for (JSONObject entry : entries) if ("incompatible".equals(entry.optString("status"))) cantRun.add(entry.optString("name"));
        if (cantRun.isEmpty()) return null;
        String body = Ui.and(cantRun) + (cantRun.size() == 1 ? " was" : " were") + " built for a different Genesis. Your data is kept. Tap the applet to see what it needs.";
        return t.banner(R.drawable.ic_warning, cantRun.size() == 1 ? "1 applet can't run" : cantRun.size() + " applets can't run",
            body, t.warningContainer, t.onWarningContainer, 0);
    }

    private View sortRow(int count) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, t.dp(8), t.dp(8), 0);
        TextView label = t.section("Your applets · " + count);
        row.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
        boolean byName = "name".equals(prefs.getString("sort", "recent"));
        TextView sort = t.text((byName ? "Name" : "Recent") + " ▾", Tokens.Type.LABEL_LARGE, t.onSurfaceVariant);
        sort.setPadding(t.dp(12), t.dp(14), t.dp(12), t.dp(14));
        sort.setBackground(t.pressable(Color.TRANSPARENT, 12, 12));
        sort.setContentDescription("Sort by " + (byName ? "name" : "most recent") + ". Tap to change.");
        sort.setOnClickListener(v -> {
            prefs.edit().putString("sort", byName ? "recent" : "name").apply();
            render();
        });
        row.addView(sort);
        return row;
    }

    private List<JSONObject> sorted(List<JSONObject> entries) {
        List<JSONObject> result = new ArrayList<>(entries);
        if ("name".equals(prefs.getString("sort", "recent"))) {
            result.sort(Comparator.comparing(entry -> entry.optString("name").toLowerCase()));
        } else {
            result.sort((a, b) -> Long.compare(b.optLong("installedAt"), a.optLong("installedAt")));
        }
        return result;
    }

    private View grid(List<JSONObject> entries) {
        GridLayout grid = new GridLayout(ui.activity);
        grid.setColumnCount(3);
        for (JSONObject entry : entries) {
            GridLayout.LayoutParams layout = new GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED), GridLayout.spec(GridLayout.UNDEFINED, 1f));
            layout.width = 0;
            grid.addView(cell(entry), layout);
        }
        return grid;
    }

    private View cell(JSONObject entry) {
        Tokens t = ui.tokens;
        String id = entry.optString("appletId"), name = entry.optString("name");
        boolean incompatible = "incompatible".equals(entry.optString("status"));
        boolean dev = "dev".equals(entry.optString("sourceKind"));
        JSONObject update = entry.optJSONObject("update");
        LinearLayout cell = ui.column();
        cell.setGravity(Gravity.CENTER_HORIZONTAL);
        cell.setPadding(t.dp(4), t.dp(10), t.dp(4), t.dp(10));
        cell.setBackground(t.pressable(Color.TRANSPARENT, 16, 16));
        cell.addView(t.tile(name, 72, dev, incompatible), new LinearLayout.LayoutParams(t.dp(72), t.dp(72)));
        TextView label = t.text(name, Tokens.Type.LABEL_LARGE, t.onSurface);
        label.setGravity(Gravity.CENTER);
        label.setMaxLines(2);
        label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setPadding(0, t.dp(8), 0, t.dp(4));
        cell.addView(label, new LinearLayout.LayoutParams(-1, -2));
        TextView chip = null;
        if (incompatible) chip = t.chip("Can't run", Tokens.Chip.WARNING);
        else if (update != null && update.optBoolean("withdrawn")) chip = t.chip("Release withdrawn", Tokens.Chip.WARNING);
        else if (update != null && Ui.str(update, "version") != null) chip = t.chip("Update", Tokens.Chip.INFO);
        else if (dev) chip = t.chip("Development build", Tokens.Chip.NEUTRAL);
        if (chip != null) cell.addView(chip);
        String description = name + (chip != null ? ", " + chip.getText() : "");
        cell.setContentDescription(description);
        cell.setClickable(true);
        cell.setOnClickListener(v -> ui.actions.openApplet(id));
        cell.setOnLongClickListener(v -> {
            options(id);
            return true;
        });
        return cell;
    }

    // -----------------------------------------------------------------------------------------
    // S02: no applets yet

    private View empty() {
        Tokens t = ui.tokens;
        LinearLayout column = ui.column();
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setPadding(t.dp(24), t.dp(24), t.dp(24), t.dp(24));
        column.addView(illustration(), new LinearLayout.LayoutParams(-1, t.dp(170)));
        TextView title = t.heading("Apps built on the sites you already use", Tokens.Type.HEADLINE);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, t.dp(24), 0, t.dp(12));
        column.addView(title);
        TextView body = t.text("An applet gives a website a simpler screen for one job. You stay signed in to the real site, and Genesis asks before anything new is allowed.",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant);
        body.setGravity(Gravity.CENTER);
        column.addView(body);
        column.addView(check("Runs on the real site, with your own sign-in"), t.margins(8, 20));
        column.addView(check("You approve every site and service it uses"), t.margins(8, 8));
        View spacer = new View(ui.activity);
        column.addView(spacer, new LinearLayout.LayoutParams(1, 0, 1));
        View repository = t.button("From a repository");
        repository.setOnClickListener(v -> navigator.addFromRepository());
        column.addView(repository, t.margins(0, 24));
        View file = t.outlinedButton("From a file");
        file.setOnClickListener(v -> ui.actions.pickFile());
        column.addView(file, t.margins(0, 12));
        View link = t.linkButton("What can an applet reach?");
        link.setOnClickListener(v -> navigator.control());
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
        layout.topMargin = t.dp(8);
        layout.gravity = Gravity.CENTER_HORIZONTAL;
        column.addView(link, layout);
        ScrollView scroll = new ScrollView(ui.activity);
        scroll.setFillViewport(true);
        scroll.addView(column, new ScrollView.LayoutParams(-1, -2));
        return scroll;
    }

    private View check(String label) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(t.icon(R.drawable.ic_check_circle, t.onSuccessContainer), new LinearLayout.LayoutParams(t.dp(22), t.dp(22)));
        TextView text = t.text(label, Tokens.Type.BODY_MEDIUM, t.onSurface);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(12));
        row.addView(text, layout);
        return row;
    }

    /** A website card with an applet tile over it, drawn from views. */
    private View illustration() {
        Tokens t = ui.tokens;
        FrameLayout frame = new FrameLayout(ui.activity);
        LinearLayout site = ui.column();
        site.setBackground(t.outlined(t.surfaceContainerLow, t.outlineVariant, 18, false));
        site.setPadding(t.dp(14), t.dp(12), t.dp(14), t.dp(12));
        LinearLayout bar = new LinearLayout(ui.activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.addView(t.icon(R.drawable.ic_website, t.onSurfaceVariant), new LinearLayout.LayoutParams(t.dp(16), t.dp(16)));
        View url = new View(ui.activity);
        url.setBackground(t.rounded(t.surfaceContainerHigh, 4));
        LinearLayout.LayoutParams urlLayout = new LinearLayout.LayoutParams(0, t.dp(10), 1);
        urlLayout.setMarginStart(t.dp(8));
        bar.addView(url, urlLayout);
        site.addView(bar);
        for (int i = 0; i < 4; i++) {
            View line = new View(ui.activity);
            line.setBackground(t.rounded(t.surfaceContainerHigh, 4));
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(i % 2 == 0 ? -1 : t.dp(120), t.dp(10));
            layout.topMargin = t.dp(14);
            site.addView(line, layout);
        }
        FrameLayout.LayoutParams siteLayout = new FrameLayout.LayoutParams(t.dp(210), t.dp(140), Gravity.CENTER);
        siteLayout.setMargins(0, 0, t.dp(40), t.dp(20));
        frame.addView(site, siteLayout);
        View phone = t.circleIcon(R.drawable.ic_applets, t.primary, t.onPrimary, 64);
        FrameLayout.LayoutParams phoneLayout = new FrameLayout.LayoutParams(t.dp(64), t.dp(64), Gravity.CENTER);
        phoneLayout.setMargins(t.dp(150), t.dp(70), 0, 0);
        frame.addView(phone, phoneLayout);
        frame.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        return frame;
    }

    // -----------------------------------------------------------------------------------------
    // S03 and S04

    /** The long-press sheet of an applet. */
    public void options(String appletId) {
        Tokens t = ui.tokens;
        JSONObject entry = ui.entry(appletId);
        if (entry == null) return;
        String name = entry.optString("name");
        LinearLayout content = ui.column();
        LinearLayout header = new LinearLayout(ui.activity);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(t.dp(20), 0, t.dp(20), t.dp(12));
        header.addView(t.tile(name, 48, "dev".equals(entry.optString("sourceKind")), "incompatible".equals(entry.optString("status"))),
            new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        LinearLayout text = ui.column();
        text.addView(t.heading(name, Tokens.Type.TITLE));
        text.addView(t.text(versionLine(entry), Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        header.addView(text, layout);
        content.addView(header);
        content.addView(t.divider());
        BottomSheetDialog[] dialog = new BottomSheetDialog[1];
        content.addView(t.row(R.drawable.ic_open_in_browser, "Open", null, null, false, t.onSurface, () -> {
            dialog[0].dismiss();
            ui.actions.openApplet(appletId);
        }));
        content.addView(t.row(R.drawable.ic_info, "Applet info", null, null, false, t.onSurface, () -> {
            dialog[0].dismiss();
            navigator.info(appletId);
        }));
        JSONObject update = entry.optJSONObject("update");
        if (update != null && Ui.str(update, "version") != null) {
            content.addView(t.row(R.drawable.ic_reload, "Review update", null, t.chip(update.optString("version") + " ready", Tokens.Chip.INFO), false, t.onSurface, () -> {
                dialog[0].dismiss();
                ui.actions.checkUpdates(appletId, true);
            }));
        }
        content.addView(t.row(R.drawable.ic_delete, "Remove…", null, null, false, t.danger, () -> {
            dialog[0].dismiss();
            navigator.remove(appletId);
        }));
        View bottom = new View(ui.activity);
        content.addView(bottom, new LinearLayout.LayoutParams(1, t.dp(16)));
        dialog[0] = ui.sheet(content);
    }

    /** "Version 1.2.0 · from github.com/owner/name". */
    public static String versionLine(JSONObject entry) {
        String version = Ui.str(entry, "version");
        String kind = entry.optString("sourceKind");
        String from;
        switch (kind) {
            case "github": from = "from github.com/" + entry.optString("repository", Ui.sourceText(Ui.str(entry, "source"))); break;
            case "file": from = "from a file"; break;
            case "bundled": from = "bundled with Genesis"; break;
            case "dev": from = "development build"; break;
            default: from = Ui.str(entry, "source") == null ? "" : "from " + Ui.sourceText(Ui.str(entry, "source"));
        }
        if (version == null) return capitalize(from);
        return "Version " + version + (from.isEmpty() ? "" : " · " + from);
    }

    /** The Add sheet: from a repository or from a file. */
    public void addSheet() {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(t.dp(20), 0, t.dp(20), t.dp(20));
        content.addView(t.heading("Add an applet", Tokens.Type.TITLE_LARGE));
        BottomSheetDialog[] dialog = new BottomSheetDialog[1];
        content.addView(choice(R.drawable.ic_branch, "From a repository", "Paste a GitHub repository or link. Genesis finds its applets and releases.", () -> {
            dialog[0].dismiss();
            navigator.addFromRepository();
        }), t.margins(0, 16));
        content.addView(choice(R.drawable.ic_file, "From a file", "Pick an applet bundle (.bundle.json) someone shared with you.", () -> {
            dialog[0].dismiss();
            ui.actions.pickFile();
        }), t.margins(0, 12));
        LinearLayout note = new LinearLayout(ui.activity);
        note.setGravity(Gravity.CENTER_VERTICAL);
        note.addView(t.icon(R.drawable.ic_shield, t.onSurfaceVariant), new LinearLayout.LayoutParams(t.dp(20), t.dp(20)));
        TextView text = t.text("Nothing is installed until you review what it can reach.", Tokens.Type.BODY_SMALL, t.onSurfaceVariant);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(10));
        note.addView(text, layout);
        content.addView(note, t.margins(0, 16));
        dialog[0] = ui.sheet(content);
    }

    private View choice(int icon, String title, String body, Runnable click) {
        Tokens t = ui.tokens;
        LinearLayout card = new LinearLayout(ui.activity);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(t.dp(16), t.dp(16), t.dp(12), t.dp(16));
        card.setBackground(t.pressable(t.outlined(t.surface, t.outlineVariant, 16, false), 16));
        card.addView(t.circleIcon(icon, t.secondaryContainer, t.onSecondaryContainer, 44), new LinearLayout.LayoutParams(t.dp(44), t.dp(44)));
        LinearLayout text = ui.column();
        text.addView(t.text(title, Tokens.Type.TITLE_MEDIUM, t.onSurface));
        text.addView(t.text(body, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        card.addView(text, layout);
        card.addView(t.icon(R.drawable.ic_chevron, t.onSurfaceVariant), new LinearLayout.LayoutParams(t.dp(20), t.dp(20)));
        card.setClickable(true);
        card.setOnClickListener(v -> click.run());
        return card;
    }

    static String capitalize(String value) {
        return value == null || value.isEmpty() ? value : Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }
}
