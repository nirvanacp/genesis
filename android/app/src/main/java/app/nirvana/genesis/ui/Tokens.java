package app.nirvana.genesis.ui;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;

/**
 * The management UI's design tokens and shared pieces: the fixed Genesis palette in light and
 * dark, the type scale, and the tiles, chips, buttons, headers and rows every screen uses.
 */
public final class Tokens {
    /** Type roles, as {size sp, line height sp, weight}. */
    public enum Type {
        HEADLINE(26, 32, 700), TITLE_LARGE(22, 28, 600), TITLE(18, 24, 600), TITLE_MEDIUM(16, 22, 600),
        BODY_LARGE(16, 24, 400), BODY_MEDIUM(14, 20, 400), BODY_SMALL(12, 16, 400),
        LABEL_LARGE(15, 20, 600), LABEL_MEDIUM(12, 16, 600), SECTION(12, 16, 700);

        final int size, line, weight;

        Type(int size, int line, int weight) { this.size = size; this.line = line; this.weight = weight; }
    }

    /** Chip colors: blue information, green verified, amber attention, red failure, grey neutral. */
    public enum Chip { INFO, SUCCESS, WARNING, DANGER, NEUTRAL, DARK }

    public final boolean dark;
    public final int surface, surfaceContainerLow, surfaceContainer, surfaceContainerHigh, onSurface, onSurfaceVariant,
        primary, onPrimary, secondaryContainer, onSecondaryContainer, errorContainer, onErrorContainer, outlineVariant, outline;
    /** The dark Genesis chrome: review header, menu header, website bar and notice headers. */
    public final int chrome, onChrome, onChromeVariant, chromeButton;
    public final int tile, onTile, danger, onDanger, successContainer, onSuccessContainer, warningContainer, onWarningContainer, scrim;
    private final Context context;

    public Tokens(Context context) {
        this.context = context;
        dark = (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        surface = color(R.color.genesis_surface);
        surfaceContainerLow = color(R.color.genesis_surface_container_low);
        surfaceContainer = color(R.color.genesis_surface_container);
        surfaceContainerHigh = color(R.color.genesis_surface_container_high);
        onSurface = color(R.color.genesis_on_surface);
        onSurfaceVariant = color(R.color.genesis_on_surface_variant);
        primary = color(R.color.genesis_primary);
        onPrimary = color(R.color.genesis_on_primary);
        secondaryContainer = color(R.color.genesis_secondary_container);
        onSecondaryContainer = color(R.color.genesis_on_secondary_container);
        errorContainer = color(R.color.genesis_error_container);
        onErrorContainer = color(R.color.genesis_on_error_container);
        outlineVariant = color(R.color.genesis_outline_variant);
        outline = color(R.color.genesis_outline);
        chrome = Color.parseColor(dark ? "#0b0c0f" : "#16181d");
        onChrome = Color.WHITE;
        onChromeVariant = Color.parseColor("#a6adba");
        chromeButton = Color.parseColor("#3a3f48");
        tile = Color.parseColor(dark ? "#2a2e35" : "#e6e8ec");
        onTile = Color.parseColor(dark ? "#c9ced6" : "#4a505b");
        danger = Color.parseColor(dark ? "#e5534b" : "#b3261e");
        onDanger = Color.WHITE;
        successContainer = Color.parseColor(dark ? "#1f3a28" : "#e3f4e8");
        onSuccessContainer = Color.parseColor(dark ? "#9fddb0" : "#1e6b3a");
        warningContainer = Color.parseColor(dark ? "#3d2e10" : "#fff1d6");
        onWarningContainer = Color.parseColor(dark ? "#f5c46b" : "#7a4b00");
        scrim = Color.parseColor("#66000000");
    }

    private int color(int id) { return context.getColor(id); }

    public Context context() { return context; }

    public int dp(float value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }

    // -----------------------------------------------------------------------------------------
    // Text and icons

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
            view.setTypeface(type.weight >= 600 ? Typeface.DEFAULT_BOLD : type.weight >= 500 ? Typeface.create("sans-serif-medium", Typeface.NORMAL) : Typeface.DEFAULT);
        }
        if (type == Type.SECTION) view.setLetterSpacing(0.06f);
        view.setTextColor(color);
    }

    /** A heading for screen readers. */
    public TextView heading(CharSequence value, Type type) {
        TextView view = text(value, type, onSurface);
        view.setAccessibilityHeading(true);
        return view;
    }

    /** A 24 dp icon tinted with `color`. */
    public ImageView icon(int drawable, int color) {
        ImageView view = new ImageView(context);
        view.setImageResource(drawable);
        view.setImageTintList(ColorStateList.valueOf(color));
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    /** An icon centered in a circle, as the notice screens lead with. */
    public View circleIcon(int drawable, int background, int foreground, int sizeDp) {
        FrameLayout circle = new FrameLayout(context);
        GradientDrawable shape = new GradientDrawable();
        shape.setShape(GradientDrawable.OVAL);
        shape.setColor(background);
        circle.setBackground(shape);
        int icon = Math.round(sizeDp * 0.45f);
        circle.addView(icon(drawable, foreground), new FrameLayout.LayoutParams(dp(icon), dp(icon), Gravity.CENTER));
        circle.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return circle;
    }

    // -----------------------------------------------------------------------------------------
    // Shapes

    public GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(dp(radiusDp));
        return shape;
    }

    /** A rounded box with a 1 dp border; `dashed` for development builds and drop targets. */
    public GradientDrawable outlined(int fill, int stroke, float radiusDp, boolean dashed) {
        GradientDrawable shape = rounded(fill, radiusDp);
        if (dashed) shape.setStroke(Math.max(1, dp(1.5f)), stroke, dp(5), dp(4));
        else shape.setStroke(Math.max(1, dp(1)), stroke);
        return shape;
    }

    /** A pressable surface: `color` with top and bottom radii (dp) and an onSurface ripple. */
    public Drawable pressable(int color, float topDp, float bottomDp) {
        float top = dp(topDp), bottom = dp(bottomDp);
        float[] radii = {top, top, top, top, bottom, bottom, bottom, bottom};
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadii(radii);
        GradientDrawable mask = new GradientDrawable();
        mask.setColor(Color.WHITE);
        mask.setCornerRadii(radii);
        int ripple = (onSurface & 0x00ffffff) | 0x1f000000;
        return new RippleDrawable(ColorStateList.valueOf(ripple), color == Color.TRANSPARENT ? null : shape, mask);
    }

    /** A ripple over any background drawable. */
    public Drawable pressable(Drawable background, float radiusDp) {
        GradientDrawable mask = rounded(Color.WHITE, radiusDp);
        int ripple = (onSurface & 0x00ffffff) | 0x1f000000;
        return new RippleDrawable(ColorStateList.valueOf(ripple), background, mask);
    }

    public View divider() {
        View line = new View(context);
        line.setBackgroundColor(outlineVariant);
        line.setLayoutParams(new LinearLayout.LayoutParams(-1, Math.max(1, dp(1))));
        return line;
    }

    // -----------------------------------------------------------------------------------------
    // Applet tiles and chips

    /** Up to two letters for an applet: the first letters of its first two words, or its first two letters. */
    public static String initials(String name) {
        if (name == null || name.trim().isEmpty()) return "?";
        String[] words = name.trim().split("[\\s_-]+");
        StringBuilder result = new StringBuilder();
        if (words.length >= 2) {
            result.appendCodePoint(words[0].codePointAt(0)).appendCodePoint(words[1].codePointAt(0));
        } else {
            String word = words[0];
            result.append(word, 0, Math.min(word.length(), word.offsetByCodePoints(0, Math.min(2, word.codePointCount(0, word.length())))));
        }
        return result.toString().toUpperCase();
    }

    /** The applet's grey rounded tile with its initials; `dashed` marks a development build, `faded` one that can't run. */
    public TextView tile(String name, int sizeDp, boolean dashed, boolean faded) {
        TextView view = new TextView(context);
        view.setText(initials(name));
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, Math.max(12, sizeDp * 0.32f));
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setTextColor(faded ? (onTile & 0x00ffffff) | 0x66000000 : onTile);
        view.setGravity(Gravity.CENTER);
        int fill = faded ? (tile & 0x00ffffff) | 0x99000000 : tile;
        view.setBackground(dashed ? outlined(surface, outline, sizeDp * 0.24f, true) : rounded(fill, sizeDp * 0.24f));
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        view.setIncludeFontPadding(false);
        return view;
    }

    public TextView chip(String label, Chip kind) {
        int background, foreground;
        switch (kind) {
            case INFO: background = secondaryContainer; foreground = onSecondaryContainer; break;
            case SUCCESS: background = successContainer; foreground = onSuccessContainer; break;
            case WARNING: background = warningContainer; foreground = onWarningContainer; break;
            case DANGER: background = errorContainer; foreground = onErrorContainer; break;
            case DARK: background = onSurface; foreground = surface; break;
            default: background = surfaceContainerHigh; foreground = onSurfaceVariant; break;
        }
        TextView chip = text(label, Type.LABEL_MEDIUM, foreground);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(dp(8), dp(3), dp(8), dp(3));
        chip.setBackground(rounded(background, 8));
        return chip;
    }

    /** The Genesis mark: a rounded square with a "G"; light on the dark chrome, dark elsewhere. */
    public TextView logo(int sizeDp, boolean onDarkChrome) {
        TextView view = new TextView(context);
        view.setText("G");
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeDp * 0.5f);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        view.setGravity(Gravity.CENTER);
        view.setIncludeFontPadding(false);
        boolean light = onDarkChrome || dark;
        view.setTextColor(light ? Color.parseColor("#16181d") : Color.WHITE);
        view.setBackground(rounded(light ? Color.WHITE : Color.parseColor("#16181d"), sizeDp * 0.26f));
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        return view;
    }

    // -----------------------------------------------------------------------------------------
    // Buttons

    private MaterialButton base(String label, int fill, int textColor, int stroke) {
        MaterialButton button = new MaterialButton(context);
        button.setText(label);
        button.setAllCaps(false);
        button.setBackgroundTintList(ColorStateList.valueOf(fill));
        button.setTextColor(textColor);
        button.setRippleColor(ColorStateList.valueOf((textColor & 0x00ffffff) | 0x29000000));
        button.setCornerRadius(dp(12));
        button.setInsetTop(0);
        button.setInsetBottom(0);
        button.setMinHeight(dp(52));
        button.setMinimumHeight(dp(52));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        button.setLetterSpacing(0f);
        if (stroke != 0) {
            button.setStrokeColor(ColorStateList.valueOf(stroke));
            button.setStrokeWidth(Math.max(1, dp(1)));
        }
        button.setElevation(0);
        button.setStateListAnimator(null);
        return button;
    }

    /** The screen's main action: filled blue. */
    public MaterialButton button(String label) { return base(label, primary, onPrimary, 0); }

    /** A secondary action: outlined. */
    public MaterialButton outlinedButton(String label) { return base(label, surface, onSurface, outlineVariant); }

    /** An action that deletes or signs out: filled red. */
    public MaterialButton dangerButton(String label) { return base(label, danger, onDanger, 0); }

    /** An outlined button with red text, for a destructive action that opens a confirmation. */
    public MaterialButton dangerOutlinedButton(String label) { return base(label, surface, danger, outlineVariant); }

    /** A compact pill button for rows and cards. */
    public MaterialButton smallButton(String label, boolean filled) {
        MaterialButton button = filled ? button(label) : outlinedButton(label);
        button.setCornerRadius(dp(filled ? 22 : 12));
        button.setMinHeight(dp(44));
        button.setMinimumHeight(dp(44));
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        button.setPadding(dp(18), 0, dp(18), 0);
        return button;
    }

    /** A blue text link, at least 48 dp tall. */
    public MaterialButton linkButton(String label) {
        MaterialButton button = new MaterialButton(context, null, androidx.appcompat.R.attr.borderlessButtonStyle);
        button.setText(label);
        button.setAllCaps(false);
        button.setTextColor(primary);
        button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        button.setLetterSpacing(0f);
        button.setMinHeight(dp(48));
        return button;
    }

    // -----------------------------------------------------------------------------------------
    // Headers and rows

    /** A page header: Back (or Close) and the title, over a divider. */
    public LinearLayout header(String title, boolean close, Runnable back) {
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(64));
        row.setPadding(dp(4), 0, dp(16), 0);
        ImageButton button = iconButton(close ? R.drawable.ic_close : R.drawable.ic_back, onSurface, close ? "Close" : "Back");
        button.setOnClickListener(v -> back.run());
        row.addView(button, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView text = heading(title, Type.TITLE_LARGE);
        text.setSingleLine(true);
        text.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(dp(8));
        row.addView(text, layout);
        column.addView(row);
        column.addView(divider());
        return column;
    }

    /** The dark Genesis bar: the mark, a title, and an optional trailing label or Close. */
    public LinearLayout chromeHeader(String title, String trailing, Runnable close) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackgroundColor(chrome);
        row.setMinimumHeight(dp(56));
        row.setPadding(dp(16), 0, dp(close == null ? 16 : 4), 0);
        row.addView(logo(26, true), new LinearLayout.LayoutParams(dp(26), dp(26)));
        TextView text = text(title, Type.TITLE_MEDIUM, onChrome);
        text.setAccessibilityHeading(true);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(dp(12));
        row.addView(text, layout);
        if (trailing != null) row.addView(text(trailing, Type.BODY_MEDIUM, onChromeVariant));
        if (close != null) {
            ImageButton button = iconButton(R.drawable.ic_close, onChrome, "Close");
            button.setOnClickListener(v -> close.run());
            row.addView(button, new LinearLayout.LayoutParams(dp(48), dp(48)));
        }
        return row;
    }

    public ImageButton iconButton(int drawable, int color, String description) {
        ImageButton button = new ImageButton(context);
        button.setImageResource(drawable);
        button.setImageTintList(ColorStateList.valueOf(color));
        button.setBackground(pressable(Color.TRANSPARENT, 24, 24));
        button.setContentDescription(description);
        return button;
    }

    /** An uppercase section label. */
    public TextView section(String label) {
        TextView view = text(label.toUpperCase(), Type.SECTION, onSurfaceVariant);
        view.setAccessibilityHeading(true);
        view.setPadding(dp(20), dp(20), dp(20), dp(8));
        return view;
    }

    /** A pressable list row: optional icon, label, optional detail, optional trailing view, optional chevron. */
    public LinearLayout row(int iconRes, String label, String detail, View trailing, boolean chevron, int labelColor, Runnable click) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(dp(56));
        row.setPadding(dp(20), dp(10), dp(16), dp(10));
        if (iconRes != 0) {
            row.addView(icon(iconRes, labelColor == onSurface ? onSurfaceVariant : labelColor), new LinearLayout.LayoutParams(dp(22), dp(22)));
        }
        LinearLayout text = new LinearLayout(context);
        text.setOrientation(LinearLayout.VERTICAL);
        text.addView(text(label, Type.BODY_LARGE, labelColor));
        if (detail != null) text.addView(text(detail, Type.BODY_MEDIUM, onSurfaceVariant));
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(iconRes == 0 ? 0 : dp(16));
        row.addView(text, textLayout);
        if (trailing != null) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-2, -2);
            layout.setMarginStart(dp(8));
            row.addView(trailing, layout);
        }
        if (chevron) {
            LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(dp(20), dp(20));
            layout.setMarginStart(dp(8));
            row.addView(icon(R.drawable.ic_chevron, onSurfaceVariant), layout);
        }
        if (click != null) {
            row.setBackground(pressable(Color.TRANSPARENT, 0, 0));
            row.setClickable(true);
            row.setFocusable(true);
            row.setOnClickListener(v -> click.run());
        }
        return row;
    }

    /** A label and value on one line, as in the details tables. */
    public LinearLayout pair(String label, String value) {
        LinearLayout row = new LinearLayout(context);
        row.setPadding(dp(20), dp(6), dp(20), dp(6));
        row.addView(text(label, Type.BODY_MEDIUM, onSurfaceVariant), new LinearLayout.LayoutParams(0, -2, 1));
        TextView text = text(value, Type.BODY_MEDIUM, onSurface);
        text.setGravity(Gravity.END);
        text.setTypeface(text.getTypeface(), Typeface.BOLD);
        row.addView(text, new LinearLayout.LayoutParams(0, -2, 1.4f));
        row.setFocusable(true);
        row.setContentDescription(label + ": " + value);
        return row;
    }

    /** A colored box with an icon and text, for warnings and confirmations. */
    public LinearLayout banner(int iconRes, String title, String body, int background, int foreground, int border) {
        LinearLayout box = new LinearLayout(context);
        box.setPadding(dp(16), dp(14), dp(16), dp(14));
        box.setBackground(border == 0 ? rounded(background, 16) : outlined(background, border, 16, false));
        if (iconRes != 0) box.addView(icon(iconRes, foreground), new LinearLayout.LayoutParams(dp(22), dp(22)));
        LinearLayout text = new LinearLayout(context);
        text.setOrientation(LinearLayout.VERTICAL);
        if (title != null) text.addView(text(title, Type.TITLE_MEDIUM, foreground));
        if (body != null) text.addView(text(body, Type.BODY_MEDIUM, foreground));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(iconRes == 0 ? 0 : dp(12));
        box.addView(text, layout);
        return box;
    }

    /** Layout with horizontal page margins and a top gap. */
    public LinearLayout.LayoutParams margins(int horizontalDp, int topDp) {
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.setMargins(dp(horizontalDp), dp(topDp), dp(horizontalDp), 0);
        return layout;
    }

    /**
     * A command the user runs on their computer, in a monospace box with a 48 dp Copy button.
     * Copying confirms itself on Android 13 and later; earlier versions get a short toast.
     */
    public View commandBox(String command) {
        LinearLayout box = new LinearLayout(context);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setBackground(rounded(surfaceContainer, 12));
        box.setPadding(dp(16), dp(4), dp(4), dp(4));
        TextView code = text(command, Type.BODY_MEDIUM, onSurface);
        code.setTypeface(Typeface.MONOSPACE);
        code.setTextIsSelectable(true);
        code.setPadding(0, dp(8), dp(8), dp(8));
        box.addView(code, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton copy = iconButton(R.drawable.ic_copy, onSurfaceVariant, "Copy command");
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

    /** Dark status and navigation bar icons in light mode, light ones in dark mode. */
    @SuppressWarnings("deprecation")
    public void applySystemBars(Activity activity) {
        activity.getWindow().setStatusBarColor(surface);
        activity.getWindow().setNavigationBarColor(surface);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = activity.getWindow().getInsetsController();
            if (controller == null) return;
            int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            controller.setSystemBarsAppearance(dark ? 0 : light, light);
        } else if (!dark) {
            activity.getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        } else {
            activity.getWindow().getDecorView().setSystemUiVisibility(0);
        }
    }
}
