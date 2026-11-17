package app.nirvana.genesis;

import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.View;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Performance spike switches, read from `adb shell setprop debug.genesis.perf.<name> <value>` so
 * one build can compare each idea against the baseline. Every switch is off when unset.
 *
 * hide:    0 covered websites stay VISIBLE (baseline); 1 always INVISIBLE; 2 INVISIBLE, shown for
 *          `wake` ms after each message, navigation or input; 3 VISIBLE but moved off screen;
 *          4 INVISIBLE and paused (`WebView.onPause`); 5 like 4, resumed and shown for `wake` ms
 *          after each message, navigation or input.
 * wake:    ms a covered website stays shown in mode 2 (default 2500).
 * lazy:    ms to delay the first load of every context after the applet's first one.
 * quiet / maxdelay: replace `publishQuietMs` / `publishMaxDelayMs` in the `bound` message.
 * trace:   1 logs each host dispatch with its duration under the tag GenesisPerf.
 */
final class Perf {
    private Perf() {}

    static final String TAG = "GenesisPerf";
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Map<View, Runnable> SLEEPS = new WeakHashMap<>();
    private static final Map<String, Integer> VALUES = new java.util.HashMap<>();

    /** Reads a switch once: the properties are set before the app starts, and a read reflects. */
    static int get(String name, int fallback) {
        return VALUES.computeIfAbsent(name, key -> read(key, fallback));
    }

    private static int read(String name, int fallback) {
        try {
            Object value = Class.forName("android.os.SystemProperties").getMethod("get", String.class)
                .invoke(null, "debug.genesis.perf." + name);
            String text = String.valueOf(value).trim();
            return text.isEmpty() ? fallback : Integer.parseInt(text);
        } catch (ReflectiveOperationException | RuntimeException error) {
            return fallback;
        }
    }

    static boolean trace() { return get("trace", 0) == 1; }

    static void log(String message) { Log.i(TAG, SystemClock.uptimeMillis() + " " + message); }

    /** A context view went under the applet UI. */
    static void covered(View view) {
        int mode = get("hide", 0);
        view.setTranslationX(mode == 3 ? 100000 : 0);
        if (mode == 1) view.setVisibility(View.INVISIBLE);
        else if (mode == 4) { view.setVisibility(View.INVISIBLE); pause(view, true); }
        else if (mode == 2 || mode == 5) wake(view);
        else view.setVisibility(View.VISIBLE);
    }

    /** A context view is shown to the user. */
    static void revealed(View view) {
        cancel(view);
        view.setTranslationX(0);
        pause(view, false);
        view.setVisibility(View.VISIBLE);
    }

    /** The applet is about to use a covered context: in mode 2 show it to the website for a while. */
    static void wake(View view) {
        int mode = get("hide", 0);
        if (mode != 2 && mode != 5) return;
        cancel(view);
        if (view.getVisibility() != View.VISIBLE) {
            if (mode == 5) pause(view, false);
            view.setVisibility(View.VISIBLE);
            if (trace()) log("wake");
        }
        Runnable sleep = () -> {
            SLEEPS.remove(view);
            view.setVisibility(View.INVISIBLE);
            if (mode == 5) pause(view, true);
            if (trace()) log("sleep");
        };
        SLEEPS.put(view, sleep);
        MAIN.postDelayed(sleep, get("wake", 2500));
    }

    private static void pause(View view, boolean paused) {
        if (!(view instanceof android.webkit.WebView web)) return;
        if (paused) web.onPause(); else web.onResume();
    }

    private static void cancel(View view) {
        Runnable sleep = SLEEPS.remove(view);
        if (sleep != null) MAIN.removeCallbacks(sleep);
    }

    /** The `bound` message with the spike's publish delays. */
    static String limits(String payload) {
        if (!payload.contains("\"type\":\"bound\"")) return payload;
        int quiet = get("quiet", -1), max = get("maxdelay", -1);
        if (quiet >= 0) payload = payload.replaceAll("\"publishQuietMs\":\\d+", "\"publishQuietMs\":" + quiet);
        if (max >= 0) payload = payload.replaceAll("\"publishMaxDelayMs\":\\d+", "\"publishMaxDelayMs\":" + max);
        return payload;
    }
}
