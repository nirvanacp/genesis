package app.nirvana.genesis;

import android.os.Looper;
import android.os.Trace;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Sends shell events to the Rust host and has the router execute the commands it returns, in order. */
final class Bridge {
    private final Router router;

    Bridge(Router router) {
        this.router = router;
    }

    static JSONObject event(String type) {
        try { return new JSONObject().put("type", type); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    void send(JSONObject event) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("UI thread required");
        JSONArray commands;
        boolean trace = Perf.trace() && !"tick".equals(event.optString("type"));
        long start = android.os.SystemClock.uptimeMillis();
        Trace.beginSection("genesis.dispatch");
        try {
            commands = new JSONArray(NativeBridge.dispatch(event.toString()));
        } catch (JSONException | RuntimeException | LinkageError error) {
            router.showError(null, "Genesis host failed: " + error);
            return;
        } finally {
            Trace.endSection();
        }
        long dispatched = android.os.SystemClock.uptimeMillis();
        if (trace) {
            String payload = event.optString("payload");
            Perf.log("event " + event.optString("type") + " " + event.optString("view") + " " + payload.substring(0, Math.min(140, payload.length()))
                + " host=" + (dispatched - start) + "ms commands=" + commands.length());
        }
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.optJSONObject(i);
            Trace.beginSection("genesis." + (command == null ? "command" : command.optString("type")));
            try {
                router.execute(command);
            } catch (JSONException | RuntimeException error) {
                router.showError(null, "Genesis could not run " + (command == null ? "a command" : command.optString("type")) + ": " + error.getMessage());
            } finally {
                Trace.endSection();
            }
        }
        long ran = android.os.SystemClock.uptimeMillis();
        if (trace && ran - dispatched > 4) Perf.log("commands " + event.optString("type") + " ran=" + (ran - dispatched) + "ms");
    }
}
