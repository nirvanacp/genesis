package app.nirvana.genesis.ui;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsetsController;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;
import com.google.android.material.color.MaterialColors;

/**
 * The management UI's design tokens: Material 3 color roles from the theme (wallpaper colors on
 * Android 12 and later, the Genesis fallback scheme before), the type scale, spacing and radii.
 */
public final class Tokens {
    /** M3 type roles used by the shell, as {size sp, line height sp, weight}. */
    public enum Type {
        TITLE_LARGE(22, 28, 400), HEADLINE_SMALL(24, 32, 400), TITLE_MEDIUM(16, 24, 500), BODY_LARGE(16, 24, 400),
        BODY_MEDIUM(14, 20, 400), LABEL_LARGE(14, 20, 500), LABEL_MEDIUM(12, 16, 500);

        final int size, line, weight;

        Type(int size, int line, int weight) { this.size = size; this.line = line; this.weight = weight; }
    }

    /** Text on an applet accent: whichever of these two has the higher contrast. */
    private static final int ON_ACCENT_DARK = Color.parseColor("#1a1a1a");

    public final boolean dark;
    public final int surface, surfaceContainerLow, surfaceContainer, surfaceContainerHigh, onSurface, onSurfaceVariant,
        primary, onPrimary, secondaryContainer, onSecondaryContainer, errorContainer, onErrorContainer, outlineVariant;
    private final Context context;

    public Tokens(Context context) {
        this.context = context;
        dark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        surface = role(com.google.android.material.R.attr.colorSurface);
        surfaceContainerLow = role(com.google.android.material.R.attr.colorSurfaceContainerLow);
        surfaceContainer = role(com.google.android.material.R.attr.colorSurfaceContainer);
        surfaceContainerHigh = role(com.google.android.material.R.attr.colorSurfaceContainerHigh);
        onSurface = role(com.google.android.material.R.attr.colorOnSurface);
        onSurfaceVariant = role(com.google.android.material.R.attr.colorOnSurfaceVariant);
        primary = role(androidx.appcompat.R.attr.colorPrimary);
        onPrimary = role(com.google.android.material.R.attr.colorOnPrimary);
        secondaryContainer = role(com.google.android.material.R.attr.colorSecondaryContainer);
        onSecondaryContainer = role(com.google.android.material.R.attr.colorOnSecondaryContainer);
        errorContainer = role(com.google.android.material.R.attr.colorErrorContainer);
        onErrorContainer = role(com.google.android.material.R.attr.colorOnErrorContainer);
        outlineVariant = role(com.google.android.material.R.attr.colorOutlineVariant);
    }

    private int role(int attr) { return MaterialColors.getColor(context, attr, Color.MAGENTA); }

    public int dp(float value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }

    /** A text view in one of the type roles. Sizes are in sp, so they follow the system font scale. */
    public TextView text(CharSequence value, Type type, int color) {
        TextView view = new TextView(context);
        view.setText(value);
        style(view, type, color);
        return view;
    }

    public void style(TextView view, Type type, int color) {
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, type.size);
        view.setLineSpacing(0, 1f);
        if (Build.VERSION.SDK_INT >= 28) {
            view.setLineHeight(Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, type.line, context.getResources().getDisplayMetrics())));
            view.setTypeface(Typeface.create(Typeface.DEFAULT, type.weight, false));
        } else {
            view.setTypeface(type.weight >= 500 ? Typeface.create("sans-serif-medium", Typeface.NORMAL) : Typeface.DEFAULT);
        }
        view.setTextColor(color);
    }

    /** A 24 dp icon tinted with `color`. */
    public ImageView icon(int drawable, int color) {
        ImageView view = new ImageView(context);
        view.setImageResource(drawable);
        view.setImageTintList(ColorStateList.valueOf(color));
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    public GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radiusDp));
        return shape;
    }

    /** A pressable surface: `color` with per-corner radii (dp, clockwise from top left) and an onSurface ripple. */
    public android.graphics.drawable.Drawable pressable(int color, float topDp, float bottomDp) {
        float top = dp(topDp), bottom = dp(bottomDp);
        float[] radii = {top, top, top, top, bottom, bottom, bottom, bottom};
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadii(radii);
        GradientDrawable mask = new GradientDrawable();
        mask.setColor(Color.WHITE);
        mask.setCornerRadii(radii);
        int ripple = (onSurface & 0x00ffffff) | 0x1f000000;
        return new android.graphics.drawable.RippleDrawable(ColorStateList.valueOf(ripple), color == Color.TRANSPARENT ? null : shape, mask);
    }

    /**
     * A command the user runs on their computer, in a monospace box with a 48 dp Copy button.
     * Copying confirms itself on Android 13 and later; earlier versions get a short toast.
     */
    public View commandBox(String command) {
        LinearLayout box = new LinearLayout(context);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setBackground(rounded(surfaceContainerHigh, 12));
        box.setPadding(dp(16), dp(4), dp(4), dp(4));
        TextView code = text(command, Type.BODY_MEDIUM, onSurface);
        code.setTypeface(Typeface.MONOSPACE);
        code.setTextIsSelectable(true);
        code.setPadding(0, dp(8), dp(8), dp(8));
        box.addView(code, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton copy = new ImageButton(context);
        copy.setImageResource(R.drawable.ic_copy);
        copy.setImageTintList(ColorStateList.valueOf(onSurfaceVariant));
        copy.setBackground(pressable(Color.TRANSPARENT, 24, 24));
        copy.setContentDescription("Copy command");
        copy.setOnClickListener(v -> copy("Genesis command", command));
        box.addView(copy, new LinearLayout.LayoutParams(dp(48), dp(48)));
        return box;
    }

    public void copy(String label, String value) {
        ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) return;
        clipboard.setPrimaryClip(ClipData.newPlainText(label, value));
        if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Copied", Toast.LENGTH_SHORT).show();
    }

    /** A Material button: filled, or tonal (secondary container) when `tonal`. */
    public MaterialButton button(String label, boolean tonal) {
        MaterialButton button = new MaterialButton(context);
        button.setText(label);
        button.setAllCaps(false);
        if (tonal) {
            button.setBackgroundTintList(ColorStateList.valueOf(secondaryContainer));
            button.setTextColor(onSecondaryContainer);
        }
        return button;
    }

    /** A Material text button. */
    public MaterialButton textButton(String label) {
        MaterialButton button = new MaterialButton(context, null, androidx.appcompat.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        return button;
    }

    /** The applet's accent when it is a valid color; the theme's primary otherwise. */
    public int accent(String value) {
        if (value == null || value.isEmpty()) return primary;
        try { return Color.parseColor(value); }
        catch (IllegalArgumentException error) { return primary; }
    }

    /** `#1a1a1a` or white on the accent, whichever contrasts more. The shell never draws text in an accent. */
    public static int onAccent(int accent) {
        double background = luminance(accent);
        double darkRatio = (background + 0.05) / (luminance(ON_ACCENT_DARK) + 0.05);
        double lightRatio = 1.05 / (background + 0.05);
        return darkRatio >= lightRatio ? ON_ACCENT_DARK : Color.WHITE;
    }

    private static double luminance(int color) {
        return 0.2126 * channel(Color.red(color)) + 0.7152 * channel(Color.green(color)) + 0.0722 * channel(Color.blue(color));
    }

    private static double channel(int value) {
        double c = value / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    /** The applet's circular avatar: its initial on its accent. */
    public TextView monogram(String name, String accentValue, int sizeDp, int textSp) {
        int accent = accent(accentValue);
        TextView view = new TextView(context);
        view.setText(name == null || name.isEmpty() ? "?" : name.substring(0, name.offsetByCodePoints(0, 1)).toUpperCase());
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSp);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(onAccent(accent));
        view.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(accent);
        view.setBackground(circle);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        view.setMinimumWidth(dp(sizeDp));
        view.setMinimumHeight(dp(sizeDp));
        return view;
    }

    /** Dark status and navigation bar icons in light mode, light ones in dark mode. */
    @SuppressWarnings("deprecation")
    public void applySystemBars(Activity activity) {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = activity.getWindow().getInsetsController();
            if (controller == null) return;
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            controller.setSystemBarsAppearance(dark ? 0 : light, light);
        } else if (!dark) {
            activity.getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }
}
