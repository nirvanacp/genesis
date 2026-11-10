package app.nirvana.genesis.ui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;

/**
 * The dark bar over a revealed website (S19, S22): the page title with a lock and its host, and
 * Done, which returns to the applet. Below it a banner says why the website is showing. The end
 * padding leaves room for the Genesis button floating above it.
 */
public final class WebsiteBar extends LinearLayout {
    /** Width kept free at the end for the floating Genesis button (48 dp target, 6 dp margin, 6 dp gap). */
    private static final int MENU_ROOM_DP = 60;

    private final Runnable done;
    private Tokens tokens;
    private String title = "", url, applet = "";
    private boolean chosen, update;

    public WebsiteBar(Context context, Tokens tokens, Runnable done) {
        super(context);
        this.tokens = tokens;
        this.done = done;
        setOrientation(VERTICAL);
        render();
    }

    public void setTitle(String value) {
        title = value == null ? "" : value;
        render();
    }

    /** Shows the host of the page's current URL, or nothing when it has none. */
    public void setUrl(String value) {
        url = value;
        render();
    }

    /**
     * `chosen` is true when the user picked View website, false when the applet showed a page
     * it has no screen for; `update` offers the applet's update in that banner.
     */
    public void setReason(String appletName, boolean chosen, boolean update) {
        applet = appletName == null ? "" : appletName;
        this.chosen = chosen;
        this.update = update;
        render();
    }

    public void restyle(Tokens tokens) {
        this.tokens = tokens;
        render();
    }

    private Runnable onUpdate;

    public void setOnUpdate(Runnable action) { onUpdate = action; }

    private void render() {
        Tokens t = tokens;
        removeAllViews();
        LinearLayout bar = new LinearLayout(getContext());
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(t.chrome);
        bar.setMinimumHeight(t.dp(64));
        bar.setPadding(t.dp(16), t.dp(8), t.dp(MENU_ROOM_DP), t.dp(8));
        LinearLayout text = new LinearLayout(getContext());
        text.setOrientation(VERTICAL);
        TextView name = t.text(title, Tokens.Type.TITLE_MEDIUM, t.onChrome);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        text.addView(name);
        String host = url == null ? null : Uri.parse(url).getHost();
        if (host != null && !host.isEmpty()) {
            LinearLayout line = new LinearLayout(getContext());
            line.setGravity(Gravity.CENTER_VERTICAL);
            line.addView(t.icon(R.drawable.ic_lock, t.onChromeVariant), new LayoutParams(t.dp(12), t.dp(12)));
            TextView site = t.text(host, Tokens.Type.LABEL_MEDIUM, t.onChromeVariant);
            site.setSingleLine(true);
            site.setEllipsize(TextUtils.TruncateAt.MIDDLE);
            LayoutParams layout = new LayoutParams(0, -2, 1);
            layout.setMarginStart(t.dp(4));
            line.addView(site, layout);
            text.addView(line);
        }
        bar.addView(text, new LayoutParams(0, -2, 1));
        MaterialButton button = new MaterialButton(getContext());
        button.setText("Done");
        button.setAllCaps(false);
        button.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15);
        button.setBackgroundTintList(ColorStateList.valueOf(android.graphics.Color.WHITE));
        button.setTextColor(t.chrome);
        button.setCornerRadius(t.dp(20));
        button.setInsetTop(t.dp(4));
        button.setInsetBottom(t.dp(4));
        button.setMinHeight(t.dp(48));
        button.setMinimumHeight(t.dp(48));
        button.setContentDescription("Done, back to " + (applet.isEmpty() ? "the applet" : applet));
        button.setOnClickListener(v -> done.run());
        LayoutParams layout = new LayoutParams(-2, -2);
        layout.setMarginStart(t.dp(8));
        bar.addView(button, layout);
        addView(bar);

        if (applet.isEmpty()) return;
        LinearLayout banner = new LinearLayout(getContext());
        banner.setGravity(Gravity.CENTER_VERTICAL);
        banner.setPadding(t.dp(16), t.dp(8), t.dp(8), t.dp(8));
        int background = chosen ? t.secondaryContainer : t.warningContainer, foreground = chosen ? t.onSecondaryContainer : t.onWarningContainer;
        banner.setBackgroundColor(background);
        banner.addView(t.icon(chosen ? R.drawable.ic_info : R.drawable.ic_warning, foreground), new LayoutParams(t.dp(18), t.dp(18)));
        TextView message = t.text(chosen ? "The real website. Done takes you back to " + applet + "."
            : applet + " doesn't have a screen for this page, so here's the website.", Tokens.Type.BODY_SMALL, foreground);
        LayoutParams messageLayout = new LayoutParams(0, -2, 1);
        messageLayout.setMarginStart(t.dp(10));
        banner.addView(message, messageLayout);
        if (!chosen && update && onUpdate != null) {
            MaterialButton action = t.linkButton("Update");
            action.setTextColor(foreground);
            action.setOnClickListener(v -> onUpdate.run());
            banner.addView(action);
        } else {
            View spacer = new View(getContext());
            banner.addView(spacer, new LayoutParams(t.dp(8), t.dp(32)));
        }
        addView(banner);
    }
}
