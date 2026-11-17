package app.nirvana.genesis;

import android.os.SystemClock;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;

/**
 * Debug switches, read from `adb shell setprop debug.genesis.<name> <value>` before the app starts.
 * Every switch is off when unset.
 *
 * perf.trace: 1 logs each host dispatch with its duration under the tag GenesisPerf.
 * activity:   off keeps every covered website awake, as before the host chose activity levels.
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

    static void log(String message) { Log.i(TAG, SystemClock.uptimeMillis() + " " + message); }
}
