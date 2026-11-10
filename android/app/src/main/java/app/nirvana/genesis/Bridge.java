package app.nirvana.genesis;

import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Sends shell events to the Rust host and executes the commands it returns, in order. */
final class Bridge {
    /** Commands that act on the activity rather than the view tree. */
    interface Task {
        void wake(long delayMs);
        void moveToBack();
    }

    private final Shell shell;
    private final ServiceClient services;
    private final Fetcher fetcher;
    private final Task task;

    Bridge(Shell shell, ServiceClient services, Fetcher fetcher, Task task) {
        this.shell = shell;
        this.services = services;
        this.fetcher = fetcher;
        this.task = task;
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
            shell.showError("Genesis host failed: " + error);
            return;
        }
        for (int i = 0; i < commands.length(); i++) {
            JSONObject command = commands.optJSONObject(i);
            try {
                execute(command);
            } catch (JSONException | RuntimeException error) {
                shell.showError("Genesis could not run " + (command == null ? "a command" : command.optString("type")) + ": " + error.getMessage());
            }
        }
    }

    private void execute(JSONObject command) throws JSONException {
        String type = command.getString("type");
        switch (type) {
            case "showLauncher": shell.showLauncher(command.getJSONArray("applets"), command.optLong("updatesCheckedAt")); break;
            case "showApplet": shell.showApplet(command.getString("appletId"), command.getString("name"), command.optString("accent", null)); break;
            case "createView":
                shell.createView(command.getJSONObject("view"), command.getString("url"), command.getJSONArray("origins"),
                    command.isNull("startScript") ? null : command.getString("startScript"));
                break;
            case "destroyView": shell.destroyView(command.getJSONObject("view")); break;
            case "loadUrl": shell.loadUrl(command.getJSONObject("view"), command.getString("url"), command.optString("mode", "push")); break;
            case "revealForeground": shell.revealForeground(); break;
            case "revealContext": shell.revealContext(command.getJSONObject("view"), command.getString("title")); break;
            case "coverContext": shell.coverContext(); break;
            case "historyGo": shell.historyGo(command.getJSONObject("view"), command.getInt("delta")); break;
            case "reload": shell.reload(command.getJSONObject("view")); break;
            case "postMessage": shell.postMessage(command.getJSONObject("view"), command.getString("payload")); break;
            case "serviceRequest": services.request(command); break;
            case "showError": shell.showError(command.getString("message")); break;
            case "showInfo": shell.showInfo(command.getString("title"), command.getString("message")); break;
            case "showStatus": shell.showStatus(command.getString("kind"), command.optJSONObject("applet"), command.getString("details")); break;
            case "openExternal": shell.openExternal(command.getString("url")); break;
            case "wake": task.wake(command.getLong("delayMs")); break;
            case "moveTaskToBack": task.moveToBack(); break;
            case "fetch": fetcher.fetch(command); break;
            case "showProgress": shell.showProgress(command.isNull("message") ? null : command.optString("message", null)); break;
            case "showRepositoryApplets": shell.showRepositoryApplets(command); break;
            case "showImportReview": shell.showImportReview(command); break;
            case "showInstalled": shell.showInstalled(command); break;
            case "forgetApplet": services.forget(command.getString("appletId")); break;
            default: throw new IllegalArgumentException("Unknown command " + type);
        }
    }
}
