package app.nirvana.genesis.ui;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.RadioButton;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Adding from a repository: the repository page (S05, S05b), the applet choice when a repository
 * has several (S05c), the version choice (S06) and the check while a build downloads (S07).
 */
public final class AddFlow {
    static final String ADD = "add", PICK = "pick", VERSION = "version", CHECKING = "checking";

    private final Ui ui;
    private String input = "";
    private boolean busy;
    private String error;
    /** The applet to go straight to when its repository lists several. */
    private String preferred;
    private JSONObject repository;
    private JSONObject chosen;
    private String selected;
    private boolean prereleases;
    private boolean fromPick;
    private String checkingName, checkingVersion;

    public AddFlow(Ui ui) { this.ui = ui; }

    /** Opens the repository page, optionally filled in and aimed at one applet of it. */
    public void open(String prefill, String appletId) {
        input = prefill == null ? "" : prefill;
        preferred = appletId;
        error = null;
        busy = false;
        ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
        if (prefill != null) find();
    }

    /** Asks the host for another version of an installed GitHub applet. */
    public void changeVersion(JSONObject entry) {
        String repo = Ui.str(entry, "repository");
        if (repo == null) return;
        open(repo, entry.optString("appletId"));
    }

    public boolean finding() { return busy && ui.pages.has(ADD); }

    /** A host error while the repository page is finding becomes the page's error box. */
    public boolean error(String message) {
        ui.pages.remove(CHECKING);
        if (!finding()) return false;
        busy = false;
        error = message;
        ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
        return true;
    }

    /**
     * Progress the flow shows itself: "Reading…" while finding, and "Downloading NAME VERSION…"
     * as the check page. Returns false for messages the shell shows as a dialog.
     */
    public boolean progress(String message) {
        if (message == null) {
            ui.root().post(() -> ui.pages.remove(CHECKING));
            return true;
        }
        if (message.startsWith("Reading ") && ui.pages.has(ADD)) return true;
        if (message.startsWith("Downloading ")) {
            String rest = message.substring("Downloading ".length()).replaceAll("[….]+$", "");
            int space = rest.lastIndexOf(' ');
            checkingName = space < 0 ? rest : rest.substring(0, space);
            checkingVersion = space < 0 ? null : rest.substring(space + 1);
            ui.pages.push(CHECKING, this::checkingPage, this::cancel, false);
            return true;
        }
        return false;
    }

    public void repositoryApplets(JSONObject command) {
        busy = false;
        error = null;
        repository = command;
        JSONArray applets = command.optJSONArray("applets");
        if (applets == null || applets.length() == 0) {
            error = Ui.str(command, "note") != null ? command.optString("note") : "This repository has no Genesis applets.";
            ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
            return;
        }
        if (ui.pages.has(ADD)) ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
        JSONObject match = null;
        for (int i = 0; i < applets.length(); i++) {
            if (applets.optJSONObject(i).optString("appletId").equals(preferred)) match = applets.optJSONObject(i);
        }
        if (match == null && applets.length() == 1) match = applets.optJSONObject(0);
        if (match != null) {
            fromPick = false;
            choose(match);
        } else {
            chosen = applets.optJSONObject(0);
            ui.pages.push(PICK, this::pickPage, this::cancel, false);
        }
    }

    /** Closes every page of the flow, after a review or an install. */
    public void finish() {
        for (String tag : new String[] {CHECKING, VERSION, PICK, ADD}) ui.pages.remove(tag);
    }

    private void cancel() {
        // Back from the versions to the applet picker keeps the host's flow and its candidates.
        if (VERSION.equals(ui.pages.top()) && fromPick) {
            ui.pages.pop();
            return;
        }
        ui.actions.cancelFlow();
        ui.pages.remove(CHECKING);
        ui.pages.remove(VERSION);
        ui.pages.remove(PICK);
    }

    private void leaveAdd() {
        if (busy) ui.actions.cancelFlow();
        busy = false;
        ui.pages.remove(ADD);
    }

    // -----------------------------------------------------------------------------------------
    // S05 and S05b

    private View addPage() {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(24));
        content.addView(t.text("Repository", Tokens.Type.LABEL_LARGE, t.onSurface), t.margins(20, 12));
        EditText field = new EditText(ui.activity);
        field.setText(input);
        field.setSelection(input.length());
        field.setHint("owner/repository");
        field.setSingleLine(true);
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        field.setImeOptions(EditorInfo.IME_ACTION_GO);
        t.style(field, Tokens.Type.BODY_LARGE, t.onSurface);
        field.setHintTextColor(t.onSurfaceVariant);
        field.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        field.setBackground(t.outlined(t.surface, error != null ? t.danger : t.outline, 12, false));
        field.setEnabled(!busy);
        field.setContentDescription("Repository");
        field.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override public void afterTextChanged(Editable s) { input = s.toString(); }
        });
        field.setOnEditorActionListener((v, action, event) -> {
            if (action != EditorInfo.IME_ACTION_GO) return false;
            find();
            return true;
        });
        content.addView(field, t.margins(20, 8));
        content.addView(t.text("owner/repo, a GitHub link, a folder link or a release link", Tokens.Type.BODY_SMALL, t.onSurfaceVariant), t.margins(20, 6));

        if (error != null) {
            content.addView(t.banner(R.drawable.ic_warning, "Couldn't add from this repository", error, t.errorContainer, t.onErrorContainer, 0), t.margins(20, 16));
        } else if (!busy) {
            LinearLayout paste = new LinearLayout(ui.activity);
            paste.setGravity(Gravity.CENTER_VERTICAL);
            paste.setPadding(t.dp(16), t.dp(12), t.dp(16), t.dp(12));
            paste.setBackground(t.pressable(t.surfaceContainer, 12, 12));
            paste.addView(t.icon(R.drawable.ic_copy, t.onSurfaceVariant), new LinearLayout.LayoutParams(t.dp(20), t.dp(20)));
            TextView label = t.text("Paste from clipboard", Tokens.Type.LABEL_LARGE, t.onSurface);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
            layout.setMarginStart(t.dp(12));
            paste.addView(label, layout);
            paste.setClickable(true);
            paste.setOnClickListener(v -> paste());
            content.addView(paste, t.margins(20, 16));
        }

        Map<String, String> before = new LinkedHashMap<>();
        for (JSONObject entry : ui.entries()) {
            String repo = Ui.str(entry, "repository");
            if (repo == null) continue;
            before.merge(repo, entry.optString("name"), (a, b) -> a + ", " + b);
        }
        if (!before.isEmpty() && !busy) {
            content.addView(t.section("Installed from before"));
            for (Map.Entry<String, String> item : before.entrySet()) {
                content.addView(t.row(R.drawable.ic_branch, item.getKey(), item.getValue(), null, true, t.onSurface, () -> {
                    input = item.getKey();
                    preferred = null;
                    find();
                }));
            }
        }

        View footer;
        if (error != null) {
            MaterialButton retry = t.button("Try again");
            retry.setOnClickListener(v -> find());
            MaterialButton back = t.outlinedButton("Back");
            back.setOnClickListener(v -> leaveAdd());
            footer = ui.footer(retry, back);
        } else {
            MaterialButton find = t.button(busy ? "Finding applets…" : "Find applet");
            find.setEnabled(!busy);
            if (busy) find.setAlpha(0.7f);
            find.setOnClickListener(v -> find());
            footer = ui.footer(find);
        }
        return ui.page(t.header("Add from a repository", false, this::leaveAdd), content, footer);
    }

    private void paste() {
        ClipboardManager clipboard = (ClipboardManager) ui.activity.getSystemService(Context.CLIPBOARD_SERVICE);
        ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return;
        CharSequence text = clip.getItemAt(0).coerceToText(ui.activity);
        if (text == null) return;
        input = text.toString().trim();
        error = null;
        ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
    }

    private void find() {
        String value = input.trim();
        if (value.isEmpty()) return;
        busy = true;
        error = null;
        ui.pages.push(ADD, this::addPage, this::leaveAdd, false);
        ui.actions.addFromRepository(value);
    }

    // -----------------------------------------------------------------------------------------
    // S05c

    private View pickPage() {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(24));
        String repo = repository.optString("repository");
        content.addView(ui.paragraph(repo + " has more than one applet. Choose the one to add.", Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        JSONArray applets = repository.optJSONArray("applets");
        for (int i = 0; i < applets.length(); i++) {
            JSONObject applet = applets.optJSONObject(i);
            String detail = "Folder: /" + applet.optString("path").replaceFirst("^\\.?/?", "")
                + (Ui.str(applet, "version") != null ? " · latest " + applet.optString("version") : "");
            if (Ui.str(applet, "installed") != null) detail += " · installed " + applet.optString("installed");
            content.addView(radioRow(t.tile(applet.optString("name"), 40, false, false), applet.optString("name"), detail, null,
                applet == chosen, true, () -> {
                    chosen = applet;
                    ui.pages.push(PICK, this::pickPage, this::cancel, false);
                }));
        }
        MaterialButton next = t.button("Continue with " + chosen.optString("name"));
        next.setOnClickListener(v -> {
            fromPick = true;
            choose(chosen);
        });
        return ui.page(t.header("Choose an applet", false, this::cancel), content, ui.footer(next));
    }

    // -----------------------------------------------------------------------------------------
    // S06

    private void choose(JSONObject applet) {
        chosen = applet;
        prereleases = false;
        selected = defaultVersion(applet);
        ui.pages.push(VERSION, this::versionPage, this::cancel, false);
    }

    private static String defaultVersion(JSONObject applet) {
        if (Ui.str(applet, "version") != null) return applet.optString("version");
        JSONArray versions = applet.optJSONArray("versions");
        for (int i = 0; versions != null && i < versions.length(); i++) {
            JSONObject version = versions.optJSONObject(i);
            if (version.optBoolean("compatible")) return version.optString("version");
        }
        return null;
    }

    private View versionPage() {
        Tokens t = ui.tokens;
        JSONObject applet = chosen;
        String name = applet.optString("name"), installed = Ui.str(applet, "installed"), latest = Ui.str(applet, "version");
        JSONArray versions = applet.optJSONArray("versions");
        int count = versions == null ? 0 : versions.length();
        boolean anyPrerelease = false;
        for (int i = 0; i < count; i++) anyPrerelease |= versions.optJSONObject(i).optBoolean("prerelease");

        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(16), 0, t.dp(24));
        LinearLayout top = new LinearLayout(ui.activity);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(t.dp(20), 0, t.dp(20), 0);
        top.addView(t.tile(name, 56, false, false), new LinearLayout.LayoutParams(t.dp(56), t.dp(56)));
        LinearLayout text = ui.column();
        text.addView(t.heading(name, Tokens.Type.TITLE_LARGE));
        text.addView(t.text(repository.optString("repository") + " · github.com", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        String releases = count == 1 ? "1 release" : count + " releases";
        if ("branch".equals(applet.optString("channel"))) releases = "Published build on a branch";
        text.addView(t.text(installed != null ? "Installed · " + installed + " · " + releases : releases, Tokens.Type.BODY_SMALL, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(14));
        top.addView(text, layout);
        content.addView(top);
        String note = Ui.str(applet, "note") != null ? applet.optString("note") : Ui.str(repository, "note");
        if (note != null) content.addView(t.banner(R.drawable.ic_info, null, note, t.surfaceContainer, t.onSurfaceVariant, 0), t.margins(20, 16));

        LinearLayout heading = new LinearLayout(ui.activity);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.setPadding(0, 0, t.dp(16), 0);
        heading.addView(t.section("Releases"), new LinearLayout.LayoutParams(0, -2, 1));
        if (anyPrerelease) {
            heading.addView(t.text("Show pre-releases", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
            MaterialSwitch toggle = new MaterialSwitch(ui.activity);
            toggle.setChecked(prereleases);
            toggle.setContentDescription("Show pre-releases");
            toggle.setOnCheckedChangeListener((button, checked) -> {
                prereleases = checked;
                ui.pages.push(VERSION, this::versionPage, this::cancel, false);
            });
            heading.addView(toggle);
        }
        content.addView(heading);

        for (int i = 0; i < count; i++) {
            JSONObject candidate = versions.optJSONObject(i);
            String version = candidate.optString("version");
            boolean compatible = candidate.optBoolean("compatible"), prerelease = candidate.optBoolean("prerelease");
            if (prerelease && !prereleases && !version.equals(installed)) continue;
            List<TextView> chips = new ArrayList<>();
            if (version.equals(latest)) chips.add(t.chip("Latest", Tokens.Chip.INFO));
            if (version.equals(installed)) chips.add(t.chip("Current", Tokens.Chip.NEUTRAL));
            if (prerelease) chips.add(t.chip("Pre-release", Tokens.Chip.WARNING));
            if (!compatible) chips.add(t.chip("Can't run", Tokens.Chip.WARNING));
            List<String> details = new ArrayList<>();
            String date = Ui.isoDate(Ui.str(candidate, "publishedAt"));
            if (date != null) details.add(date);
            if (Ui.str(candidate, "notes") != null) details.add(candidate.optString("notes"));
            if (!compatible && Ui.str(candidate, "note") != null) details.add(candidate.optString("note"));
            content.addView(radioRow(null, version, details.isEmpty() ? null : String.join(" · ", details), chips,
                version.equals(selected), compatible, () -> {
                    selected = version;
                    ui.pages.push(VERSION, this::versionPage, this::cancel, false);
                }));
        }
        if (count == 0) {
            content.addView(ui.paragraph("Genesis installs the build published on this branch.", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        }

        List<View> footer = new ArrayList<>();
        MaterialButton go;
        if (selected != null && selected.equals(installed)) {
            go = t.button("Reinstall " + selected);
        } else if (selected != null && installed != null && Ui.compareVersions(selected, installed) < 0) {
            footer.add(t.banner(R.drawable.ic_warning, null, "Older versions may not work with data saved by " + installed + ".",
                t.warningContainer, t.onWarningContainer, 0));
            go = t.button("Downgrade to " + selected);
        } else {
            go = t.button(selected != null ? "Check and review " + selected : "Check and review");
        }
        boolean enabled = selected != null || count == 0;
        go.setEnabled(enabled);
        if (!enabled) go.setAlpha(0.5f);
        String appletId = applet.optString("appletId"), version = selected;
        go.setOnClickListener(v -> ui.actions.chooseCandidate(appletId, version));
        footer.add(go);
        return ui.page(t.header("Choose a version", false, this::cancel), content, ui.footer(footer.toArray(new View[0])));
    }

    /** A selectable row with a radio indicator; disabled rows are dimmed and can't be chosen. */
    private View radioRow(View leading, String title, String detail, List<TextView> chips, boolean checked, boolean enabled, Runnable choose) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(t.dp(64));
        row.setPadding(t.dp(12), t.dp(12), t.dp(20), t.dp(12));
        RadioButton radio = new RadioButton(ui.activity);
        radio.setChecked(checked);
        radio.setClickable(false);
        radio.setFocusable(false);
        radio.setButtonTintList(ColorStateList.valueOf(checked ? t.primary : t.outline));
        row.addView(radio, new LinearLayout.LayoutParams(t.dp(48), t.dp(48)));
        if (leading != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(t.dp(40), t.dp(40));
            layout.setMarginEnd(t.dp(12));
            row.addView(leading, layout);
        }
        LinearLayout text = ui.column();
        LinearLayout line = new LinearLayout(ui.activity);
        line.setGravity(Gravity.CENTER_VERTICAL);
        line.addView(t.text(title, Tokens.Type.TITLE_MEDIUM, t.onSurface));
        if (chips != null) {
            for (TextView chip : chips) {
                LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
                layout.setMarginStart(t.dp(8));
                line.addView(chip, layout);
            }
        }
        text.addView(line);
        if (detail != null) {
            TextView body = t.text(detail, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant);
            body.setMaxLines(3);
            body.setEllipsize(android.text.TextUtils.TruncateAt.END);
            text.addView(body);
        }
        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1));
        if (checked) row.setBackground(t.rounded(t.secondaryContainer, 0));
        if (enabled) {
            if (!checked) row.setBackground(t.pressable(Color.TRANSPARENT, 0, 0));
            row.setClickable(true);
            row.setOnClickListener(v -> choose.run());
        } else {
            row.setAlpha(0.5f);
        }
        StringBuilder description = new StringBuilder(title);
        if (chips != null) for (TextView chip : chips) description.append(", ").append(chip.getText());
        if (detail != null) description.append(". ").append(detail);
        description.append(checked ? ", selected" : enabled ? "" : ", unavailable");
        row.setContentDescription(description);
        return row;
    }

    // -----------------------------------------------------------------------------------------
    // S07

    private View checkingPage() {
        Tokens t = ui.tokens;
        String title = checkingName + (checkingVersion != null ? " " + checkingVersion : "");
        LinearLayout content = ui.column();
        content.setPadding(t.dp(24), t.dp(32), t.dp(24), t.dp(24));
        content.addView(t.tile(checkingName, 72, false, false), new LinearLayout.LayoutParams(t.dp(72), t.dp(72)));
        TextView heading = t.heading("Checking " + title, Tokens.Type.HEADLINE);
        heading.setPadding(0, t.dp(20), 0, t.dp(8));
        content.addView(heading);
        content.addView(t.text("Genesis downloads the build and checks it before you see what it can reach.", Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        content.addView(step(true, "Downloading the build"), t.margins(0, 28));
        content.addView(step(false, "Checking the files match the release"), t.margins(0, 16));
        content.addView(step(false, "Preparing your review"), t.margins(0, 16));
        LinearLayout note = new LinearLayout(ui.activity);
        note.setGravity(Gravity.CENTER_VERTICAL);
        note.addView(t.icon(R.drawable.ic_shield, t.onSurfaceVariant), new LinearLayout.LayoutParams(t.dp(20), t.dp(20)));
        TextView text = t.text("Nothing is installed until you approve the review.", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(10));
        note.addView(text, layout);
        content.addView(note, t.margins(0, 32));
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> cancel());
        return ui.page(t.header("Checking", true, this::cancel), content, ui.footer(cancel));
    }

    private View step(boolean running, String label) {
        Tokens t = ui.tokens;
        LinearLayout row = new LinearLayout(ui.activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        if (running) {
            ProgressBar spinner = new ProgressBar(ui.activity);
            spinner.setIndeterminateTintList(ColorStateList.valueOf(t.primary));
            row.addView(spinner, new LinearLayout.LayoutParams(t.dp(24), t.dp(24)));
        } else {
            View dot = new View(ui.activity);
            dot.setBackground(t.outlined(t.surface, t.outlineVariant, 12, false));
            row.addView(dot, new LinearLayout.LayoutParams(t.dp(24), t.dp(24)));
        }
        TextView text = t.text(label, running ? Tokens.Type.TITLE_MEDIUM : Tokens.Type.BODY_LARGE, running ? t.onSurface : t.onSurfaceVariant);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(16));
        row.addView(text, layout);
        return row;
    }
}
