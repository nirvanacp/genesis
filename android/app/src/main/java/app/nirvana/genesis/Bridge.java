package app.nirvana.genesis;

import android.os.Looper;
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
        try {
            commands = new JSONArray(NativeBridge.dispatch(event.toString()));
        } catch (JSONException | RuntimeException | LinkageError error) {
            router.showError(null, "Genesis host failed: " + error);
            return;
        }
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.optJSONObject(i);
            try {
                router.execute(command);
            } catch (JSONException | RuntimeException error) {
                router.showError(null, "Genesis could not run " + (command == null ? "a command" : command.optString("type")) + ": " + error.getMessage());
            }
        }
    }
}
