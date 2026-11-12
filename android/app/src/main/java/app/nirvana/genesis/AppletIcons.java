package app.nirvana.genesis;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.util.LruCache;
import androidx.core.graphics.drawable.IconCompat;
import java.util.Locale;

/**
 * An applet's icon art for the launcher, shortcuts and Recents: its `shell.icon` PNG on the
 * accent color, or the first letter of its name when it has no icon or the file cannot be read.
 */
public final class AppletIcons {
    /** 108 dp at xxxhdpi, the full adaptive icon including the area masks may cut. */
    private static final int ADAPTIVE_PX = 432;
    /** The part of an adaptive icon every mask keeps: 72 of 108 dp. */
    private static final float SAFE_ZONE = 72f / 108f;
    private static final int TASK_PX = 192;
    /** Material neutral, for applets without an accent. */
    private static final int NEUTRAL = 0xff5f6368;
    /** Icon paths include the revision, so a path always names the same picture. */
    private static final LruCache<String, Bitmap> DECODED = new LruCache<>(24);

    private AppletIcons() {}

    /** The decoded icon file, or null when there is none or it does not decode. */
    public static Bitmap decode(String iconPath) {
        if (iconPath == null || iconPath.isEmpty()) return null;
        Bitmap cached = DECODED.get(iconPath);
        if (cached != null) return cached;
        Bitmap bitmap = BitmapFactory.decodeFile(iconPath);
        if (bitmap != null) DECODED.put(iconPath, bitmap);
        return bitmap;
    }

    public static int accentColor(String accent) {
        if (accent == null || accent.isEmpty()) return NEUTRAL;
        try {
            return Color.parseColor(accent);
        } catch (IllegalArgumentException e) {
            return NEUTRAL;
        }
    }

    /** The full adaptive icon: the accent fill with the icon, or the letter, inside the safe zone. */
    public static Bitmap adaptive(String name, String accent, String iconPath) {
        Bitmap result = Bitmap.createBitmap(ADAPTIVE_PX, ADAPTIVE_PX, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(result);
        canvas.drawColor(accentColor(accent));
        Bitmap icon = decode(iconPath);
        if (icon != null) {
            float inset = ADAPTIVE_PX * (1 - SAFE_ZONE) / 2;
            RectF target = new RectF(inset, inset, ADAPTIVE_PX - inset, ADAPTIVE_PX - inset);
            canvas.drawBitmap(icon, null, target, new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG));
        } else {
            drawLetter(canvas, name, ADAPTIVE_PX);
        }
        return result;
    }

    public static IconCompat shortcutIcon(String name, String accent, String iconPath) {
        return IconCompat.createWithAdaptiveBitmap(adaptive(name, accent, iconPath));
    }

    /** The visible part of the adaptive art, masked to a circle, for the Recents card. */
    public static Bitmap taskIcon(String name, String accent, String iconPath) {
        Bitmap art = adaptive(name, accent, iconPath);
        int inset = Math.round(ADAPTIVE_PX * (1 - SAFE_ZONE) / 2);
        Bitmap visible = Bitmap.createScaledBitmap(
            Bitmap.createBitmap(art, inset, inset, ADAPTIVE_PX - 2 * inset, ADAPTIVE_PX - 2 * inset), TASK_PX, TASK_PX, true);
        Bitmap result = Bitmap.createBitmap(TASK_PX, TASK_PX, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setShader(new BitmapShader(visible, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        new Canvas(result).drawCircle(TASK_PX / 2f, TASK_PX / 2f, TASK_PX / 2f, paint);
        return result;
    }

    private static void drawLetter(Canvas canvas, String name, int size) {
        String letter = name == null || name.trim().isEmpty() ? "?"
            : new String(Character.toChars(name.trim().codePointAt(0))).toUpperCase(Locale.ROOT);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.WHITE);
        paint.setTypeface(Typeface.DEFAULT_BOLD);
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(size * 0.45f);
        Rect bounds = new Rect();
        paint.getTextBounds(letter, 0, letter.length(), bounds);
        canvas.drawText(letter, size / 2f, size / 2f - bounds.exactCenterY(), paint);
    }
}
