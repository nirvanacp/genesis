package app.nirvana.genesis.ui;

import android.graphics.Color;
import android.net.Uri;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.bottomsheet.BottomSheetDialog;

/**
 * The Genesis menu over an applet (S18, S18b): a dark header naming the applet and the page it
 * is on, then Home, Reload, View website (or, while a website is revealed, Open in browser and
 * Copy link), Service connections when the applet declares any, and Applet info.
 */
public final class GenesisMenu {
    public enum Action { HOME, RELOAD, VIEW_WEBSITE, OPEN_IN_BROWSER, COPY_LINK, SERVICES, INFO }

    public interface Listener { void onMenuAction(Action action); }

    private GenesisMenu() {}

    /** `entry` is the applet's launcher entry, or null; `url` the page shown or behind the applet. */
    public static void show(Ui ui, String name, org.json.JSONObject entry, String url, boolean websiteRevealed, Listener listener) {
        Tokens t = ui.tokens;
        BottomSheetDialog dialog = new BottomSheetDialog(ui.activity);
        LinearLayout column = ui.column();
        column.setBackgroundColor(t.surface);

        LinearLayout header = new LinearLayout(ui.activity);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setBackgroundColor(t.chrome);
        header.setPadding(t.dp(20), t.dp(20), t.dp(20), t.dp(18));
        header.addView(t.appletTile(name, entry == null ? null : Ui.str(entry, "icon"), 44, false, false), new LinearLayout.LayoutParams(t.dp(44), t.dp(44)));
        LinearLayout text = ui.column();
        String version = entry == null ? null : Ui.str(entry, "version");
        TextView title = t.text(name + (version != null ? "  " + version : ""), Tokens.Type.TITLE_MEDIUM, t.onChrome);
        title.setAccessibilityHeading(true);
        text.addView(title);
        String host = url == null ? null : Uri.parse(url).getHost();
        if (host != null) {
            LinearLayout line = new LinearLayout(ui.activity);
            line.setGravity(Gravity.CENTER_VERTICAL);
            line.addView(t.icon(R.drawable.ic_lock, t.onChromeVariant), new LinearLayout.LayoutParams(t.dp(14), t.dp(14)));
            TextView site = t.text(host, Tokens.Type.BODY_MEDIUM, t.onChromeVariant);
            site.setSingleLine(true);
            site.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
            layout.setMarginStart(t.dp(6));
            line.addView(site, layout);
            text.addView(line);
        }
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(t.dp(14));
        header.addView(text, textLayout);
        header.addView(t.text("GENESIS", Tokens.Type.SECTION, t.onChromeVariant));
        column.addView(header);

        column.addView(row(ui, dialog, listener, R.drawable.ic_home, "Home", null, Action.HOME));
        column.addView(row(ui, dialog, listener, R.drawable.ic_reload, "Reload " + name, null, Action.RELOAD));
        if (websiteRevealed) {
            column.addView(row(ui, dialog, listener, R.drawable.ic_open_in_browser, "Open in browser", null, Action.OPEN_IN_BROWSER));
            column.addView(row(ui, dialog, listener, R.drawable.ic_link, "Copy link", null, Action.COPY_LINK));
        } else {
            column.addView(row(ui, dialog, listener, R.drawable.ic_website, "View website", host == null ? null : "Show " + host + " itself", Action.VIEW_WEBSITE));
        }
        View divider = t.divider();
        LinearLayout.LayoutParams dividerLayout = new LinearLayout.LayoutParams(-1, Math.max(1, t.dp(1)));
        dividerLayout.setMargins(t.dp(20), t.dp(4), t.dp(20), t.dp(4));
        column.addView(divider, dividerLayout);
        if (entry != null && entry.has("services")) {
            column.addView(row(ui, dialog, listener, R.drawable.ic_services, "Service connections", null, Action.SERVICES));
        }
        column.addView(row(ui, dialog, listener, R.drawable.ic_info, "Applet info", "Version, sites, data and removal", Action.INFO));
        View bottom = new View(ui.activity);
        column.addView(bottom, new LinearLayout.LayoutParams(1, t.dp(12)));

        android.widget.ScrollView scroll = new android.widget.ScrollView(ui.activity);
        scroll.addView(column);
        dialog.setContentView(scroll);
        dialog.getBehavior().setSkipCollapsed(true);
        dialog.getBehavior().setState(com.google.android.material.bottomsheet.BottomSheetBehavior.STATE_EXPANDED);
        dialog.show();
    }

    private static View row(Ui ui, BottomSheetDialog dialog, Listener listener, int icon, String label, String detail, Action action) {
        Tokens t = ui.tokens;
        return t.row(icon, label, detail, null, false, t.onSurface, () -> {
            dialog.dismiss();
            listener.onMenuAction(action);
        });
    }

    /** The floating Genesis button: a dark circle with a white G in a 48 dp target. */
    public static View button(Tokens t, Runnable click) {
        TextView mark = new TextView(t.context());
        mark.setText("G");
        mark.setGravity(Gravity.CENTER);
        mark.setTextColor(Color.WHITE);
        mark.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 16);
        mark.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        mark.setIncludeFontPadding(false);
        android.graphics.drawable.GradientDrawable circle = new android.graphics.drawable.GradientDrawable();
        circle.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        circle.setColor(t.chrome);
        circle.setStroke(Math.max(1, t.dp(1.5f)), 0x55ffffff);
        android.widget.FrameLayout target = new android.widget.FrameLayout(t.context());
        target.addView(mark, new android.widget.FrameLayout.LayoutParams(t.dp(36), t.dp(36), Gravity.CENTER));
        mark.setBackground(circle);
        target.setContentDescription("Genesis menu");
        target.setClickable(true);
        target.setFocusable(true);
        target.setBackground(t.pressable(Color.TRANSPARENT, 24, 24));
        target.setOnClickListener(v -> click.run());
        target.setElevation(t.dp(4));
        return target;
    }

    /** The button's look while a website is revealed (grey on the dark bar) or over the applet. */
    public static void tint(View button, Tokens t, boolean revealed) {
        View mark = ((android.widget.FrameLayout) button).getChildAt(0);
        android.graphics.drawable.GradientDrawable circle = (android.graphics.drawable.GradientDrawable) mark.getBackground();
        circle.setColor(revealed ? t.chromeButton : t.chrome);
    }
}
