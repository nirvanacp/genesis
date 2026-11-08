package app.nirvana.genesis.ui;

import android.content.Context;
import android.net.Uri;
import android.text.TextUtils;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.android.material.button.MaterialButton;

/**
 * The bar over a revealed website: the page title with its host below, and Done, which returns
 * to the applet. It is at least 64 dp tall and grows with the font size. The end padding leaves
 * room for the Genesis button floating above it.
 */
public final class WebsiteBar extends LinearLayout {
    /** Width kept free at the end for the floating Genesis button (48 dp target, 6 dp margin, 6 dp gap). */
    private static final int MENU_ROOM_DP = 60;

    private final TextView title, host;
    private final MaterialButton button;

    public WebsiteBar(Context context, Tokens tokens, Runnable done) {
        super(context);
        setGravity(Gravity.CENTER_VERTICAL);
        setBackgroundColor(tokens.surfaceContainer);
        setMinimumHeight(tokens.dp(64));
        setPadding(tokens.dp(16), tokens.dp(8), tokens.dp(MENU_ROOM_DP), tokens.dp(8));

        LinearLayout text = new LinearLayout(context);
        text.setOrientation(VERTICAL);
        title = tokens.text("", Tokens.Type.TITLE_MEDIUM, tokens.onSurface);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        text.addView(title);
        host = tokens.text("", Tokens.Type.LABEL_MEDIUM, tokens.onSurfaceVariant);
        host.setSingleLine(true);
        host.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        text.addView(host);
        addView(text, new LayoutParams(0, -2, 1));

        button = tokens.button("Done", true);
        button.setInsetTop(tokens.dp(4));
        button.setInsetBottom(tokens.dp(4));
        button.setCornerRadius(tokens.dp(20));
        button.setMinHeight(tokens.dp(48));
        button.setMinimumHeight(tokens.dp(48));
        button.setOnClickListener(v -> done.run());
        LayoutParams layout = new LayoutParams(-2, -2);
        layout.setMarginStart(tokens.dp(8));
        addView(button, layout);
    }

    public void setTitle(String value) { title.setText(value); }

    /** Takes the colors of a new appearance. */
    public void restyle(Tokens tokens) {
        setBackgroundColor(tokens.surfaceContainer);
        title.setTextColor(tokens.onSurface);
        host.setTextColor(tokens.onSurfaceVariant);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(tokens.secondaryContainer));
        button.setTextColor(tokens.onSecondaryContainer);
    }

    /** Shows the host of the page's current URL, or nothing when it has none. */
    public void setUrl(String url) {
        String value = url == null ? null : Uri.parse(url).getHost();
        host.setText(value == null ? "" : value);
        host.setVisibility(value == null || value.isEmpty() ? GONE : VISIBLE);
    }
}
