package app.nirvana.genesis;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import app.nirvana.genesis.ui.Ui;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Executes host commands on the window they belong to. Commands with a view, and session
 * commands, go to that applet's window; launcher, flow and review commands go to the manager;
 * messages go to the window they name, else the window the user last had in front. The router
 * decides nothing about which applet runs: it only finds the window.
 */
final class Router {
    private static final String TAG = "GenesisRouter";
    static final String OPEN_APPLET = "app.nirvana.genesis.OPEN_APPLET";
    static final String APPLET_SCHEME = "genesis-applet";

    private final GenesisRuntime runtime;
    private Shell manager;
    private final Map<String, Shell> applets = new HashMap<>();
    /** The window that resumed last, while it exists. */
    private Shell recent;
    /** The host's latest launcher entries, which a new window starts with. */
    private JSONArray entries = new JSONArray();
    private long updatesCheckedAt;

    Router(GenesisRuntime runtime) {
        this.runtime = runtime;
    }

    // -----------------------------------------------------------------------------------------
    // Windows

    void attach(Shell shell) {
        if (shell.window() == null) manager = shell;
        else applets.put(shell.window(), shell);
        shell.updateApplets(entries, updatesCheckedAt);
    }

    void detach(Shell shell) {
        if (manager == shell) manager = null;
        if (shell.window() != null && applets.get(shell.window()) == shell) applets.remove(shell.window());
        if (recent == shell) recent = null;
    }

    void resumed(Shell shell) { recent = shell; }

    /** The applet's window, if it exists, applies its "Hide in recent apps" choice now. */
    void privacyChanged(String appletId) {
        Shell shell = applets.get(appletId);
        if (shell != null) Shell.applyPrivacy(shell.activity(), appletId);
    }

    /** The canonical intent of an applet's window: one document task per applet. */
    static Intent appletIntent(Context context, String appletId) {
        return new Intent(context, AppletActivity.class).setAction(OPEN_APPLET)
            .setData(new Uri.Builder().scheme(APPLET_SCHEME).opaquePart(appletId).build())
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NEW_DOCUMENT);
    }

    /** The applet id an applet window's intent names, or null. */
    static String appletId(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !APPLET_SCHEME.equals(data.getScheme())) return null;
        String id = data.getSchemeSpecificPart();
        return id == null || id.isEmpty() ? null : id;
    }

    // -----------------------------------------------------------------------------------------
    // Commands

    void execute(JSONObject command) throws JSONException {
        String type = command.getString("type");
        switch (type) {
            case "updateApplets": updateApplets(command.getJSONArray("applets"), command.optLong("updatesCheckedAt"), false); break;
            case "showLauncher": updateApplets(command.getJSONArray("applets"), command.optLong("updatesCheckedAt"), true); break;
            case "showApplet": {
                Shell shell = applet(command.getString("appletId"), type);
                String id = command.getString("appletId"), name = command.getString("name");
                String accent = Ui.str(command, "accent"), icon = Ui.str(command, "icon");
                if (shell != null) shell.showApplet(id, name, accent, icon);
                runtime.shortcuts.opened(id, name, accent, icon);
                break;
            }
            case "createView": {
                Shell shell = view(command, type);
                if (shell != null) shell.createView(command.getJSONObject("view"), command.getString("url"), command.getJSONArray("origins"),
                    command.isNull("startScript") ? null : command.getString("startScript"));
                break;
            }
            case "destroyView": { Shell shell = view(command, type); if (shell != null) shell.destroyView(command.getJSONObject("view")); break; }
            case "loadUrl": { Shell shell = view(command, type); if (shell != null) shell.loadUrl(command.getJSONObject("view"), command.getString("url"), command.optString("mode", "push")); break; }
            case "revealContext": { Shell shell = view(command, type); if (shell != null) shell.revealContext(command.getJSONObject("view"), command.getString("title")); break; }
            case "historyGo": { Shell shell = view(command, type); if (shell != null) shell.historyGo(command.getJSONObject("view"), command.getInt("delta")); break; }
            case "reload": { Shell shell = view(command, type); if (shell != null) shell.reload(command.getJSONObject("view")); break; }
            case "postMessage": { Shell shell = view(command, type); if (shell != null) shell.postMessage(command.getJSONObject("view"), command.getString("payload")); break; }
            case "input": { Shell shell = view(command, type); if (shell != null) shell.input(command.getJSONObject("view"), command.getLong("token"), command.getJSONArray("events")); break; }
            case "showWindow": { Shell shell = view(command, type); if (shell != null) shell.showWindow(command.getJSONObject("view"), command.getString("url")); break; }
            case "revealForeground": { Shell shell = named(command, type); if (shell != null) shell.revealForeground(); break; }
            case "coverContext": { Shell shell = named(command, type); if (shell != null) shell.coverContext(); break; }
            case "moveTaskToBack": { Shell shell = named(command, type); if (shell != null) shell.activity().moveTaskToBack(true); break; }
            case "showError": showError(appletIdOf(command), command.getString("message")); break;
            case "showInfo": { Shell shell = messageWindow(appletIdOf(command)); if (shell != null) shell.showInfo(command.getString("title"), command.getString("message")); break; }
            case "showStatus": {
                Shell shell = messageWindow(appletIdOf(command));
                if (shell != null) shell.showStatus(command.getString("kind"), command.optJSONObject("applet"), command.getString("details"));
                break;
            }
            case "chooseApplet": {
                // The window the user is looking at asked: the manager's list or share, or an applet's link.
                Shell shell = messageWindow(null);
                if (shell != null) shell.chooseApplet(command.getString("url"), command.getJSONArray("applets"), command.optBoolean("external"));
                break;
            }
            // Update review, version change and import pages belong to the window the user started
            // them from: an applet's own Applet info page, or the manager.
            case "showProgress": { Shell shell = messageWindow(null); if (shell != null) shell.showProgress(command.isNull("message") ? null : command.optString("message", null)); break; }
            case "showRepositoryApplets": { Shell shell = messageWindow(null); if (shell != null) shell.showRepositoryApplets(command); break; }
            case "showImportReview": { Shell shell = messageWindow(null); if (shell != null) shell.showImportReview(command); break; }
            case "showInstalled": { Shell shell = messageWindow(null); if (shell != null) shell.showInstalled(command); break; }
            case "serviceRequest": runtime.services.request(command); break;
            case "fetch": runtime.fetcher.fetch(command); break;
            case "wake": runtime.wake(command.getLong("delayMs")); break;
            case "forgetApplet": {
                String id = command.getString("appletId");
                runtime.services.forget(id);
                runtime.shortcuts.forget(id);
                runtime.notifications.forget(id);
                for (Shell shell : windows()) shell.forgetProfile(id);
                Shell.forgetApplet(runtime.app, id);
                break;
            }
            case "startAppletWindow": start(appletIntent(runtime.app, command.getString("appletId"))); break;
            case "openManager": start(new Intent(runtime.app, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); break;
            case "postNotification":
                runtime.notifications.post(command.getString("appletId"), command.getString("id"), command.getString("title"),
                    appletText(command, "body"), appletText(command, "url"));
                break;
            case "closeAppletWindow": closeAppletWindow(command.getString("appletId")); break;
            default: throw new IllegalArgumentException("Unknown command " + type);
        }
    }

    /** The manager shows its list; applet windows keep the entries for their menu and info pages. */
    private void updateApplets(JSONArray applets, long checkedAt, boolean showLauncher) {
        entries = applets;
        updatesCheckedAt = checkedAt;
        runtime.shortcuts.update(applets);
        runtime.notifications.sync(applets);
        runtime.drawer.sync(applets);
        for (Shell shell : applets().values()) shell.updateApplets(applets, checkedAt);
        if (manager == null) return;
        if (showLauncher) manager.showLauncher(applets, checkedAt);
        else manager.updateApplets(applets, checkedAt);
    }

    void showError(String appletId, String message) {
        Shell shell = messageWindow(appletId);
        if (shell != null) shell.showError(message);
        else Log.w(TAG, "No window for: " + message);
    }

    /** The named applet's window, else the manager for Genesis's own messages, else the window last in front. */
    private Shell messageWindow(String appletId) {
        if (appletId != null && applets.containsKey(appletId)) return applets.get(appletId);
        if (appletId == null && manager != null && (recent == null || recent == manager)) return manager;
        if (recent != null) return recent;
        if (manager != null) return manager;
        List<Shell> all = windows();
        return all.isEmpty() ? null : all.get(0);
    }

    private Shell view(JSONObject command, String type) throws JSONException {
        return applet(command.getJSONObject("view").getString("appletId"), type);
    }

    private Shell named(JSONObject command, String type) {
        String id = appletIdOf(command);
        return id == null ? manager(type) : applet(id, type);
    }

    private Shell applet(String appletId, String type) {
        Shell shell = applets.get(appletId);
        if (shell == null) Log.w(TAG, "Dropped " + type + ": no window for " + appletId);
        return shell;
    }

    private Shell manager(String type) {
        if (manager == null) Log.w(TAG, "Dropped " + type + ": no manager window");
        return manager;
    }

    private static String appletIdOf(JSONObject command) {
        return command.isNull("appletId") ? null : command.optString("appletId", null);
    }

    private static String appletText(JSONObject command, String key) {
        return command.isNull(key) ? null : command.optString(key, null);
    }

    private Map<String, Shell> applets() { return new HashMap<>(applets); }

    private List<Shell> windows() {
        List<Shell> all = new ArrayList<>(applets.values());
        if (manager != null) all.add(manager);
        return all;
    }

    /** Starts a window from the one in front, for its transition, or from the application. */
    private void start(Intent intent) {
        Activity from = recent == null ? null : recent.activity();
        try {
            if (from != null && !from.isFinishing()) from.startActivity(intent);
            else runtime.app.startActivity(intent);
        } catch (RuntimeException error) {
            Log.w(TAG, "Could not start " + intent, error);
        }
    }

    /** Removes the applet's task, and with it its Recents card, whether or not its window exists. */
    private void closeAppletWindow(String appletId) {
        ActivityManager activities = runtime.app.getSystemService(ActivityManager.class);
        if (activities == null) return;
        for (ActivityManager.AppTask task : activities.getAppTasks()) {
            try {
                Intent base = task.getTaskInfo().baseIntent;
                if (appletId.equals(appletId(base))) task.finishAndRemoveTask();
            } catch (IllegalArgumentException gone) {
                // The task ended while the list was read.
            }
        }
    }
}
