package app.nirvana.genesis;

import android.os.SystemClock;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;

/**
 * Debug switches, read from `adb shell setprop debug.genesis.<name> <value>` before the app starts.
 * Every switch is off when unset.
 *
 * perf.trace: 1 logs each host dispatch with its duration under the tag GenesisPerf, marks the
 *             shell's message handling as trace sections, and logs `firstEmit <appletId>` when
 *             an applet's screens get their first watch value (`tools/bench.mjs` cold reads it).
 * activity:   off keeps every covered website awake, as before the host chose activity levels.
 * ui_profile: off keeps the applet's screens in the websites' WebView profile and renderer.
 * light:      off lets covered websites load images, as before light pages.
 * webview_startup: off starts the WebView engine on the main thread at its first use, instead of
 *             on a background thread when the first window opens.
 * store:      off makes the host keep no cached watch values; live values arrive as before.
 */
final class Perf {
    private Perf() {}

    static final String TAG = "GenesisPerf";
    private static final Map<String, String> VALUES = new HashMap<>();

    /** Reads a switch once: the properties are set before the app starts, and a read reflects. */
    private static String get(String name) {
        return VALUES.computeIfAbsent(name, Perf::read);
    }

    private static String read(String name) {
        try {
            Object value = Class.forName("android.os.SystemProperties").getMethod("get", String.class)
                .invoke(null, "debug.genesis." + name);
            return String.valueOf(value).trim();
        } catch (ReflectiveOperationException | RuntimeException error) {
            return "";
        }
    }

    static boolean trace() { return "1".equals(get("perf.trace")); }

    static boolean activityOff() { return "off".equals(get("activity")); }

    static boolean uiProfileOff() { return "off".equals(get("ui_profile")); }

    static boolean lightOff() { return "off".equals(get("light")); }

    static boolean webViewStartUpOff() { return "off".equals(get("webview_startup")); }

    static boolean storeOff() { return "off".equals(get("store")); }

    static void log(String message) { Log.i(TAG, SystemClock.uptimeMillis() + " " + message); }
}
