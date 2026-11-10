package app.nirvana.genesis.ui;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import app.nirvana.genesis.SiteData;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.button.MaterialButton;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/** Settings (S24), Sites & sign-ins (S25, S25b), how Genesis keeps you in control, and About. */
public final class Settings {
    static final String SETTINGS = "settings", SITES = "sites", CONTROL = "control", ABOUT = "about";

    private final Ui ui;
    private final Runnable updates;
    private long storageBytes = -1;

    public Settings(Ui ui, Runnable updates) {
        this.ui = ui;
        this.updates = updates;
    }

    public void open() {
        ui.pages.push(SETTINGS, this::settingsPage, null, true);
        ui.actions.storageSize(bytes -> {
            storageBytes = bytes;
            if (ui.pages.has(SETTINGS)) ui.pages.refresh();
        });
    }

    private String version() {
        try {
            PackageInfo info = ui.activity.getPackageManager().getPackageInfo(ui.activity.getPackageName(), 0);
            return info.versionName;
        } catch (PackageManager.NameNotFoundException error) {
            return null;
        }
    }

    private View settingsPage() {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, 0, 0, t.dp(32));
        content.addView(t.section("Genesis"));
        String version = version();
        content.addView(t.row(R.drawable.ic_info, "Genesis " + (version != null ? version : ""), "Applets update from their own repositories. Genesis updates from where you installed it.",
            null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_reload, "Check applets for updates", ui.updatesCheckedAt > 0 ? "Checked " + Ui.ago(ui.updatesCheckedAt) : "Not checked yet",
            null, true, t.onSurface, updates));
        content.addView(t.section("Privacy"));
        int sites = 0;
        for (Group group : groups()) sites += group.origins.size();
        content.addView(t.row(R.drawable.ic_lock, "Sites & sign-ins", sites == 1 ? "1 website" : sites + " websites", null, true, t.onSurface,
            () -> ui.pages.push(SITES, this::sitesPage, null, true)));
        int count = ui.applets.length();
        String size = storageBytes < 0 ? "Measuring…" : Ui.size(storageBytes) + " for " + (count == 1 ? "1 applet" : count + " applets");
        content.addView(t.row(R.drawable.ic_storage, "Storage", size, null, false, t.onSurface, null));
        content.addView(t.section("Help"));
        content.addView(t.row(R.drawable.ic_shield, "How Genesis keeps you in control", null, null, true, t.onSurface,
            () -> ui.pages.push(CONTROL, () -> control(ui), null, false)));
        content.addView(t.row(R.drawable.ic_file, "About and licences", null, null, true, t.onSurface,
            () -> ui.pages.push(ABOUT, this::aboutPage, null, false)));
        return ui.page(t.header("Settings", false, () -> ui.pages.remove(SETTINGS)), content, null);
    }

    /** One profile and the hosts its applets use, each with the names of the applets that use it. */
    private static final class Group {
        /** Null for the shared sign-in. */
        final String title;
        final SiteData site;
        final Map<String, List<String>> origins = new LinkedHashMap<>();

        Group(String title, SiteData site) { this.title = title; this.site = site; }
    }

    /** The shared sign-in first, then each applet that keeps a separate one. */
    private List<Group> groups() {
        Group shared = new Group(null, ui.actions.sites());
        List<Group> result = new ArrayList<>(List.of(shared));
        for (JSONObject entry : ui.entries()) {
            String appletId = entry.optString("appletId"), name = entry.optString("name");
            Group group = shared;
            if (ui.actions.separateSignIn(appletId)) {
                group = new Group(name + "'s separate sign-in", ui.actions.sitesFor(appletId));
                result.add(group);
            }
            for (String origin : Ui.strings(entry.optJSONArray("origins"))) group.origins.computeIfAbsent(origin, key -> new ArrayList<>()).add(name);
        }
        if (shared.origins.isEmpty() && result.size() > 1) result.remove(shared);
        return result;
    }

    private View sitesPage() {
        Tokens t = ui.tokens;
        List<Group> groups = groups();
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(32));
        content.addView(ui.paragraph("Applets use your own sign-in on these websites. Signing out here clears what the site stored on this phone, for every applet that uses it.",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        if (groups.get(0).origins.isEmpty()) content.addView(ui.paragraph("No applet uses a website yet.", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        List<Group> signed = new ArrayList<>();
        for (Group group : groups) {
            if (group.origins.isEmpty()) continue;
            content.addView(t.section(group.title != null ? group.title : groups.size() > 1 ? "Shared sign-in" : "Websites"));
            List<String> in = new ArrayList<>();
            for (Map.Entry<String, List<String>> site : group.origins.entrySet()) {
                boolean signedIn = group.site.hasCookies(site.getKey());
                if (signedIn) in.add(site.getKey());
                String granted = group.site.grants().describe(site.getKey());
                TextView chip = signedIn ? t.chip("Signed in", Tokens.Chip.SUCCESS) : t.chip("Signed out", Tokens.Chip.NEUTRAL);
                String detail = "Used by " + Ui.and(site.getValue()) + (granted == null ? "" : " · " + granted);
                content.addView(t.row(R.drawable.ic_website, Ui.host(site.getKey()), detail, chip, signedIn || granted != null, t.onSurface,
                    signedIn ? () -> signOut(List.of(group), List.of(site.getKey()), false) : granted != null ? () -> resetPermissions(group.site, site.getKey()) : null));
            }
            if (!in.isEmpty()) signed.add(group);
        }
        View footer = null;
        if (!signed.isEmpty()) {
            List<String> origins = new ArrayList<>();
            for (Group group : signed) for (String origin : group.origins.keySet()) if (!origins.contains(origin)) origins.add(origin);
            MaterialButton all = t.dangerOutlinedButton("Sign out of all sites");
            all.setOnClickListener(v -> signOut(signed, origins, true));
            footer = ui.footer(all);
        }
        return ui.page(t.header("Sites & sign-ins", false, () -> ui.pages.remove(SITES)), content, footer);
    }

    /** Signs out of `origins` in one group, or clears every site of each group when `all`. */
    private void signOut(List<Group> groups, List<String> origins, boolean all) {
        Tokens t = ui.tokens;
        List<String> users = new ArrayList<>();
        for (Group group : groups) {
            for (String origin : origins) for (String name : group.origins.getOrDefault(origin, List.of())) if (!users.contains(name)) users.add(name);
        }
        SiteData site = groups.get(0).site;
        LinearLayout content = ui.column();
        content.setPadding(t.dp(20), 0, t.dp(20), t.dp(20));
        String title = origins.size() == 1 ? "Sign out of " + Ui.host(origins.get(0)) + "?" : "Sign out of " + origins.size() + " sites?";
        content.addView(t.heading(title, Tokens.Type.TITLE_LARGE));
        content.addView(t.text("Genesis deletes the cookies and site data these websites stored on this phone. "
            + Ui.and(users) + " will ask you to sign in again. Your applet data stays.", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant), t.margins(0, 12));
        BottomSheetDialog[] dialog = new BottomSheetDialog[1];
        MaterialButton out = t.dangerButton("Sign out");
        out.setOnClickListener(v -> {
            dialog[0].dismiss();
            Runnable done = () -> ui.pages.refresh();
            if (all) for (Group group : groups) group.site.clearAll(done);
            else site.signOut(origins, ui.actions.visitedUrls(), done);
        });
        content.addView(out, t.margins(0, 20));
        if (!all && site.grants().describe(origins.get(0)) != null) {
            MaterialButton reset = t.outlinedButton("Reset permissions");
            reset.setOnClickListener(v -> { dialog[0].dismiss(); site.grants().clear(origins.get(0)); ui.pages.refresh(); });
            content.addView(reset, t.margins(0, 12));
        }
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> dialog[0].dismiss());
        content.addView(cancel, t.margins(0, 12));
        dialog[0] = ui.sheet(content);
    }

    /** A signed-out site that still has permission answers: forgetting them makes it ask again. */
    private void resetPermissions(SiteData site, String origin) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(t.dp(20), 0, t.dp(20), t.dp(20));
        content.addView(t.heading("Reset permissions for " + Ui.host(origin) + "?", Tokens.Type.TITLE_LARGE));
        content.addView(t.text(site.grants().describe(origin) + ". The website will ask again the next time it needs them.",
            Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant), t.margins(0, 12));
        BottomSheetDialog[] dialog = new BottomSheetDialog[1];
        MaterialButton reset = t.button("Reset permissions");
        reset.setOnClickListener(v -> { dialog[0].dismiss(); site.grants().clear(origin); ui.pages.refresh(); });
        content.addView(reset, t.margins(0, 20));
        MaterialButton cancel = t.outlinedButton("Cancel");
        cancel.setOnClickListener(v -> dialog[0].dismiss());
        content.addView(cancel, t.margins(0, 12));
        dialog[0] = ui.sheet(content);
    }

    /** How Genesis keeps you in control: what an applet can and can't reach. */
    public static View control(Ui ui) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(32));
        content.addView(ui.paragraph("An applet is a simpler screen over websites you already use. Genesis decides what it can reach, and asks you first.",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        content.addView(t.section("An applet can"));
        content.addView(t.row(R.drawable.ic_website, "Use the websites it lists", "With your own sign-in, seeing what you see there", null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_storage, "Keep its own data on this phone", "Only if it says so, erased when you remove it", null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_services, "Talk to its developer's servers", "Only the ones it names, after you connect them", null, false, t.onSurface, null));
        content.addView(t.section("An applet can't"));
        content.addView(t.row(R.drawable.ic_block, "Reach any other website", "Genesis blocks every site the review didn't show you", null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_lock, "See your passwords or other applets", "Each applet's data is its own", null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_shield, "Change what it reaches without asking", "An update that wants more waits for your review", null, false, t.onSurface, null));
        content.addView(t.row(R.drawable.ic_lock, "Use your camera, microphone or location", "Websites ask you first, and only while you're looking at them", null, false, t.onSurface, null));
        content.addView(t.section("Blocked builds"));
        content.addView(ui.paragraph("Genesis checks every build before the review. A build that breaks these rules, or whose files don't match its release, is blocked and never installs.",
            Tokens.Type.BODY_MEDIUM, t.onSurface));
        return ui.page(t.header("How Genesis keeps you in control", false, () -> ui.pages.remove(CONTROL)), content, null);
    }

    private View aboutPage() {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(t.dp(24), t.dp(32), t.dp(24), t.dp(32));
        content.addView(t.logo(64, false), new LinearLayout.LayoutParams(t.dp(64), t.dp(64)));
        TextView name = t.heading("Genesis", Tokens.Type.HEADLINE);
        name.setPadding(0, t.dp(16), 0, t.dp(4));
        content.addView(name);
        String version = version();
        if (version != null) content.addView(t.text("Version " + version, Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        TextView body = t.text("Genesis runs applets: native-feeling screens over the websites you already use, in your own sessions.\n\n"
            + "Genesis uses AndroidX, Material Components for Android and Android System WebView (Apache License 2.0), and Rust crates under the MIT and Apache 2.0 licences.",
            Tokens.Type.BODY_MEDIUM, t.onSurface);
        body.setPadding(0, t.dp(24), 0, 0);
        content.addView(body);
        return ui.page(t.header("About and licences", false, () -> ui.pages.remove(ABOUT)), content, null);
    }
}
