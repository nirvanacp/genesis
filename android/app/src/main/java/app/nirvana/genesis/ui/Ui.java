package app.nirvana.genesis.ui;

import android.app.Activity;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.nirvana.genesis.SiteData;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.bottomsheet.BottomSheetDragHandleView;
import java.text.DateFormat;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What every management screen shares: the tokens, the page stack, the user's actions the shell
 * forwards to the host, and the host's latest list of installed applets.
 */
public final class Ui {
    /** User decisions the shell turns into host events or local work. */
    public interface Actions {
        void openApplet(String appletId);
        void addFromRepository(String input);
        /** Asks for a website link and opens it in the applet that uses that site. */
        void openLink();
        void pickFile();
        /** `version` null is the newest compatible stable version. */
        void chooseCandidate(String appletId, String version);
        void cancelFlow();
        /** `replace` is "keep" or "erase" for a replacement, null otherwise. */
        void reviewDecision(String reviewId, boolean accept, String replace);
        void checkUpdates(String appletId, boolean manual);
        void removeApplet(String appletId);
        void clearData(String appletId);
        void keepVersion(String appletId);
        /** A Genesis menu action the host handles: home (open Genesis), reload or viewWebsite. */
        void menu(String action);
        /** "Go to Home" on a notice: an applet window opens the Genesis list. */
        void goHome();
        void openExternal(String url);
        Connections.Store connections();
        /** The shared cookies and site storage of the websites applets use. */
        SiteData sites();
        /** The applet's own profile when it keeps a separate sign-in, otherwise `sites()`. */
        SiteData sitesFor(String appletId);
        /** Whether this phone's WebView can keep a separate sign-in per applet. */
        boolean separateSignInAvailable();
        boolean separateSignIn(String appletId);
        void setSeparateSignIn(String appletId, boolean on);
        /** Whether the applet's Recents card hides its screen. */
        boolean hiddenInRecents(String appletId);
        void setHiddenInRecents(String appletId, boolean on);
        /** Every URL the open applet's pages have visited, for signing out of cookies on deeper paths. */
        List<String> visitedUrls();
        /** Total bytes Genesis stores for applets on this phone, computed off the UI thread. */
        void storageSize(java.util.function.LongConsumer result);
    }

    public final Activity activity;
    public Tokens tokens;
    public final Actions actions;
    public final Pages pages;
    /** The host's launcher entries and when every applet was last checked for updates. */
    public JSONArray applets = new JSONArray();
    public long updatesCheckedAt;

    public Ui(Activity activity, Tokens tokens, Actions actions) {
        this.activity = activity;
        this.tokens = tokens;
        this.actions = actions;
        pages = new Pages(activity);
    }

    public View root() { return pages.root; }

    public JSONObject entry(String appletId) {
        for (int i = 0; i < applets.length(); i++) {
            JSONObject entry = applets.optJSONObject(i);
            if (entry != null && entry.optString("appletId").equals(appletId)) return entry;
        }
        return null;
    }

    public List<JSONObject> entries() {
        List<JSONObject> result = new ArrayList<>();
        for (int i = 0; i < applets.length(); i++) if (applets.optJSONObject(i) != null) result.add(applets.optJSONObject(i));
        return result;
    }

    // -----------------------------------------------------------------------------------------
    // Layout

    /** A full page: a header, scrolling content, and an optional footer of actions over a divider. */
    public View page(View header, View content, View footer) {
        LinearLayout page = new LinearLayout(activity);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(tokens.surface);
        page.setClickable(true);
        if (header != null) page.addView(header, new LinearLayout.LayoutParams(-1, -2));
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));
        page.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if (footer != null) {
            page.addView(tokens.divider());
            page.addView(footer, new LinearLayout.LayoutParams(-1, -2));
        }
        return page;
    }

    public LinearLayout column() {
        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        return column;
    }

    /** Footer buttons, stacked full width with 12 dp between them. Null entries are skipped. */
    public LinearLayout footer(View... views) {
        LinearLayout footer = column();
        footer.setPadding(tokens.dp(20), tokens.dp(16), tokens.dp(20), tokens.dp(16));
        boolean first = true;
        for (View view : views) {
            if (view == null) continue;
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
            if (!first) layout.topMargin = tokens.dp(12);
            footer.addView(view, layout);
            first = false;
        }
        return footer;
    }

    /** A paragraph with page margins. */
    public TextView paragraph(String value, Tokens.Type type, int color) {
        TextView text = tokens.text(value, type, color);
        text.setPadding(tokens.dp(20), tokens.dp(8), tokens.dp(20), tokens.dp(8));
        return text;
    }

    /** A modal sheet over the current screen; the content scrolls when it is taller than the screen. */
    public BottomSheetDialog sheet(View content) {
        BottomSheetDialog dialog = new BottomSheetDialog(activity);
        LinearLayout column = column();
        column.setBackgroundColor(tokens.surface);
        column.addView(new BottomSheetDragHandleView(activity));
        column.addView(content);
        ScrollView scroll = new ScrollView(activity);
        scroll.addView(column);
        dialog.setContentView(scroll);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.show();
        return dialog;
    }

    /** A centered column for the notice screens: icon, cause chip, headline, body. */
    public LinearLayout notice(View icon, String cause, String headline, String body) {
        LinearLayout column = column();
        column.setPadding(tokens.dp(24), tokens.dp(28), tokens.dp(24), tokens.dp(16));
        if (icon != null) column.addView(icon, new LinearLayout.LayoutParams(tokens.dp(68), tokens.dp(68)));
        if (cause != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.topMargin = tokens.dp(16);
            column.addView(tokens.chip(cause, Tokens.Chip.NEUTRAL), layout);
        }
        TextView title = tokens.heading(headline, Tokens.Type.HEADLINE);
        title.setPadding(0, tokens.dp(12), 0, tokens.dp(10));
        column.addView(title);
        if (body != null) column.addView(tokens.text(body, Tokens.Type.BODY_LARGE, tokens.onSurfaceVariant));
        return column;
    }

    /** A tile with a centered check badge at its bottom end, for "installed". */
    public View badgedTile(String name, int sizeDp) {
        FrameLayout frame = new FrameLayout(activity);
        frame.addView(tokens.tile(name, sizeDp, false, false), new FrameLayout.LayoutParams(tokens.dp(sizeDp), tokens.dp(sizeDp)));
        View badge = tokens.circleIcon(app.nirvana.genesis.R.drawable.ic_check, tokens.onSuccessContainer, Color.WHITE, 30);
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(tokens.dp(30), tokens.dp(30), Gravity.BOTTOM | Gravity.END);
        layout.setMargins(0, 0, -tokens.dp(8), -tokens.dp(8));
        frame.addView(badge, layout);
        frame.setClipChildren(false);
        return frame;
    }

    // -----------------------------------------------------------------------------------------
    // Values

    /** A string field that is absent, null or empty reads as null. */
    public static String str(JSONObject object, String key) {
        if (object == null || object.isNull(key)) return null;
        String value = object.optString(key, null);
        return value == null || value.isEmpty() ? null : value;
    }

    public static List<String> strings(JSONArray values) {
        List<String> result = new ArrayList<>();
        for (int i = 0; values != null && i < values.length(); i++) result.add(values.optString(i));
        return result;
    }

    /** "a", "a and b", "a, b and c". */
    public static String and(List<String> values) {
        if (values.isEmpty()) return "";
        if (values.size() == 1) return values.get(0);
        return String.join(", ", values.subList(0, values.size() - 1)) + " and " + values.get(values.size() - 1);
    }

    /** The host part of an origin such as https://news.ycombinator.com. */
    public static String host(String origin) {
        if (origin == null) return "";
        String value = origin.replaceFirst("^[a-z]+://", "");
        int slash = value.indexOf('/');
        return slash < 0 ? value : value.substring(0, slash);
    }

    public static List<String> hosts(List<String> origins) {
        List<String> result = new ArrayList<>();
        for (String origin : origins) result.add(host(origin));
        return result;
    }

    /** "GitHub owner/name, branch b" as "github.com/owner/name"; other sources stay as they are. */
    public static String sourceText(String label) {
        if (label == null) return "";
        if (!label.startsWith("GitHub ")) return label;
        String place = label.substring(7);
        int comma = place.indexOf(',');
        return "github.com/" + (comma < 0 ? place : place.substring(0, comma) + " (" + place.substring(comma + 2) + ")");
    }

    /** The repository "owner/name" named by a GitHub source label, or null. */
    public static String repositoryOf(String label) {
        if (label == null || !label.startsWith("GitHub ")) return null;
        String[] parts = label.substring(7).split("[/,]");
        return parts.length >= 2 ? parts[0].trim() + "/" + parts[1].trim() : null;
    }

    public static String shortHash(String sha) {
        if (sha == null || sha.length() < 12) return sha;
        return sha.substring(0, 4) + "…" + sha.substring(sha.length() - 4);
    }

    public static String date(long millis) {
        return DateFormat.getDateInstance(DateFormat.MEDIUM).format(new Date(millis));
    }

    /** An ISO 8601 date from GitHub as a medium date, or null. */
    public static String isoDate(String iso) {
        if (iso == null) return null;
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date parsed = format.parse(iso.length() >= 19 ? iso.substring(0, 19) : iso);
            return parsed == null ? null : DateFormat.getDateInstance(DateFormat.MEDIUM).format(parsed);
        } catch (ParseException error) {
            return null;
        }
    }

    /** "just now", "10 min ago", "3 h ago", "2 days ago". */
    public static String ago(long millis) {
        long minutes = Math.max(0, (System.currentTimeMillis() - millis) / 60000);
        if (minutes < 1) return "just now";
        if (minutes < 60) return minutes + " min ago";
        long hours = minutes / 60;
        if (hours < 24) return hours + " h ago";
        long days = hours / 24;
        return days == 1 ? "1 day ago" : days + " days ago";
    }

    public static String size(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024.0) + " KB";
        return String.format(Locale.US, "%.1f MB", bytes / (1024.0 * 1024.0));
    }

    /** Compares dotted versions with an optional prerelease suffix; a prerelease sorts before its release. */
    public static int compareVersions(String a, String b) {
        String[] left = a.split("-", 2), right = b.split("-", 2);
        String[] x = left[0].split("\\."), y = right[0].split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? number(x[i]) : 0, q = i < y.length ? number(y[i]) : 0;
            if (p != q) return Integer.compare(p, q);
        }
        if (left.length == 1 && right.length == 1) return 0;
        if (left.length == 1) return 1;
        if (right.length == 1) return -1;
        return left[1].compareTo(right[1]);
    }

    private static int number(String part) {
        try { return Integer.parseInt(part.replaceAll("[^0-9].*$", "")); }
        catch (NumberFormatException error) { return 0; }
    }
}
