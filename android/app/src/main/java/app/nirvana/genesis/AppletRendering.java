package app.nirvana.genesis;

import android.content.Context;
import android.os.Build;
import android.view.View;

/** Device-local rendering preferences, scoped to a stable applet identity. */
final class AppletRendering {
    static final String[] MODES = {"default", "hardware", "software"};
    static final String[] LABELS = {"Default", "Hardware acceleration", "Software compatibility"};

    static int selection(Context context, String appletId) {
        String mode = context.getSharedPreferences("applet-rendering", Context.MODE_PRIVATE)
            .getString(appletId, "default");
        for (int i = 0; i < MODES.length; i++) if (MODES[i].equals(mode)) return i;
        return 0;
    }

    static void save(Context context, String appletId, int selection) {
        if (selection < 0 || selection >= MODES.length) throw new IllegalArgumentException("Unknown rendering mode");
        context.getSharedPreferences("applet-rendering", Context.MODE_PRIVATE).edit()
            .putString(appletId, MODES[selection]).apply();
    }

    static int layerType(Context context, String appletId, boolean customized) {
        int selection = selection(context, appletId);
        if (selection == 1) return View.LAYER_TYPE_NONE;
        if (selection == 2) return View.LAYER_TYPE_SOFTWARE;
        // Preserve the existing emulator table-paint workaround for applets
        // that have no explicit preference. External readers use their default.
        boolean emulator = "ranchu".equals(Build.HARDWARE) || "goldfish".equals(Build.HARDWARE)
            || Build.FINGERPRINT.startsWith("generic");
        return emulator && customized ? View.LAYER_TYPE_SOFTWARE : View.LAYER_TYPE_NONE;
    }
}
