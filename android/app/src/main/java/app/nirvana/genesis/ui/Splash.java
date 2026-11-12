package app.nirvana.genesis.ui;

import android.content.Context;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.google.android.material.progressindicator.LinearProgressIndicator;

/** Covers the applet while it starts: its tile and name, and a progress bar once opening takes a while. */
public final class Splash extends FrameLayout {
    /** Fast starts never show the progress bar. */
    private static final long PROGRESS_DELAY_MS = 1000;

    private Tokens tokens;
    private final FrameLayout monogram;
    private final TextView name;
    private final LinearProgressIndicator progress;
    private final Runnable showProgress;

    public Splash(Context context, Tokens tokens) {
        super(context);
        this.tokens = tokens;
        setBackgroundColor(tokens.surface);
        setClickable(true);
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        column.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        monogram = new FrameLayout(context);
        column.addView(monogram, new LinearLayout.LayoutParams(tokens.dp(72), tokens.dp(72)));
        name = tokens.text("", Tokens.Type.TITLE_LARGE, tokens.onSurface);
        name.setGravity(Gravity.CENTER);
        name.setPadding(tokens.dp(24), tokens.dp(16), tokens.dp(24), tokens.dp(24));
        column.addView(name, new LinearLayout.LayoutParams(-1, -2));
        progress = new LinearProgressIndicator(context);
        progress.setIndicatorColor(tokens.primary);
        progress.setTrackColor(tokens.surfaceContainerHigh);
        progress.setIndeterminate(true);
        progress.setVisibility(View.INVISIBLE);
        column.addView(progress, new LinearLayout.LayoutParams(tokens.dp(160), -2));
        addView(column, new FrameLayout.LayoutParams(-1, -2, Gravity.CENTER));
        showProgress = () -> progress.setVisibility(View.VISIBLE);
    }

    public void show(String appletName, String iconPath) {
        monogram.removeAllViews();
        monogram.addView(tokens.appletTile(appletName, iconPath, 72, false, false), new FrameLayout.LayoutParams(-1, -1));
        name.setText(appletName);
        setContentDescription("Opening " + appletName);
        removeCallbacks(showProgress);
        progress.setVisibility(View.INVISIBLE);
        setVisibility(View.VISIBLE);
        postDelayed(showProgress, PROGRESS_DELAY_MS);
    }

    /** Takes the colors of a new appearance; the next `show` uses them for the tile too. */
    public void restyle(Tokens tokens) {
        this.tokens = tokens;
        setBackgroundColor(tokens.surface);
        name.setTextColor(tokens.onSurface);
    }

    public void hide() {
        removeCallbacks(showProgress);
        progress.setVisibility(View.INVISIBLE);
        setVisibility(View.GONE);
    }
}
