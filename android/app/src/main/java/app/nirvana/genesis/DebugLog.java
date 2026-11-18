package app.nirvana.genesis;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.File;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The shell's side of an applet's debug log: which applets have it on, and the shell events it
 * records. The host writes the file. The preference `debugLog:<appletId>` holds the time the user
 * turned the log on; the log turns off on its own `ON_MS` later. Call sites check `any` first, so a
 * log that is off costs one field read.
 */
final class DebugLog {
    static final long ON_MS = 7L * 24 * 60 * 60 * 1000;
    /** A shared copy is for the share sheet that just used it; later starts delete it. */
    private static final long SHARED_MS = 24L * 60 * 60 * 1000;
    private static final String PREFIX = "debugLog:";

    /** Whether any applet's log is on. */
    static volatile boolean any;
    private static final Set<String> applets = ConcurrentHashMap.newKeySet();
    private static GenesisRuntime runtime;

    private DebugLog() {}

    /** Right after `attach`, before any window opens an applet: tells the host which applets log, turns expired logs off and deletes old shared copies. */
    static void start(GenesisRuntime runtime) {
        DebugLog.runtime = runtime;
        SharedPreferences state = state(runtime.app);
        for (Map.Entry<String, ?> entry : state.getAll().entrySet()) {
            if (!entry.getKey().startsWith(PREFIX)) continue;
            String appletId = entry.getKey().substring(PREFIX.length());
            if (expired(entry.getValue())) state.edit().remove(entry.getKey()).apply();
            else {
                applets.add(appletId);
                runtime.send(switchEvent(appletId, true));
            }
        }
        any = !applets.isEmpty();
        File[] shared = new File(runtime.app.getCacheDir(), "shared-logs").listFiles();
        long now = System.currentTimeMillis();
        for (File file : shared == null ? new File[0] : shared) if (now - file.lastModified() > SHARED_MS) file.delete();
    }

    /** The applet opens: a log on for longer than `ON_MS` turns off. */
    static void opened(String appletId) {
        if (runtime == null || !applets.contains(appletId)) return;
        SharedPreferences state = state(runtime.app);
        if (!expired(state.getAll().get(PREFIX + appletId))) return;
        state.edit().remove(PREFIX + appletId).apply();
        applets.remove(appletId);
        any = !applets.isEmpty();
        // The host is running the command that opened the applet; it hears this right after.
        JSONObject event = switchEvent(appletId, false);
        runtime.main.post(() -> runtime.send(event));
    }

    static boolean on(String appletId) { return applets.contains(appletId); }

    /**
     * The user's switch, from the UI thread outside any host command. The host hears it at once,
     * so the reload the caller sends next gives the applet's pages the new limit.
     */
    static void set(Context context, String appletId, boolean on) {
        SharedPreferences state = state(context);
        if (on) state.edit().putLong(PREFIX + appletId, System.currentTimeMillis()).apply();
        else state.edit().remove(PREFIX + appletId).apply();
        if (on) applets.add(appletId);
        else applets.remove(appletId);
        any = !applets.isEmpty();
        if (runtime != null) runtime.send(switchEvent(appletId, on));
    }

    /** Whether the applet has log files to share. */
    static boolean exists(Context context, String appletId) {
        String[] files = new File(context.getFilesDir(), "logs/" + appletId).list();
        return files != null && files.length > 0;
    }

    /** A removed or erased applet's switch goes with it; the host deletes its files. */
    static void forget(Context context, String appletId) {
        state(context).edit().remove(PREFIX + appletId).apply();
        applets.remove(appletId);
        any = !applets.isEmpty();
    }

    /**
     * Records one shell event for the applet when its log is on. `fields` are name and value
     * pairs. The event goes to the host after the work under way, since the host may be the caller.
     */
    static void log(String appletId, String ev, Object... fields) {
        if (!any || appletId == null || !applets.contains(appletId) || runtime == null) return;
        try {
            JSONObject entry = new JSONObject().put("t", System.currentTimeMillis()).put("ev", ev);
            if (fields.length > 0) {
                JSONObject d = new JSONObject();
                for (int i = 0; i + 1 < fields.length; i += 2) d.put(String.valueOf(fields[i]), fields[i + 1] == null ? JSONObject.NULL : fields[i + 1]);
                entry.put("d", d);
            }
            JSONObject event = Bridge.event("log").put("appletId", appletId).put("entry", entry);
            runtime.main.post(() -> runtime.send(event));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    private static JSONObject switchEvent(String appletId, boolean on) {
        try { return Bridge.event("debugLog").put("appletId", appletId).put("on", on); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    private static boolean expired(Object since) {
        return !(since instanceof Long) || System.currentTimeMillis() - (Long) since > ON_MS;
    }

    private static SharedPreferences state(Context context) {
        return context.getSharedPreferences("genesis-shell", Context.MODE_PRIVATE);
    }
}
