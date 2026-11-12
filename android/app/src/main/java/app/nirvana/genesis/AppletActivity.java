package app.nirvana.genesis;

import android.content.Intent;
import android.os.Bundle;
import org.json.JSONException;

/**
 * One applet's window, in its own document task, so the applet has its own Recents card. The
 * intent's data names the applet (`genesis-applet:<id>`). The applet starts when this window
 * resumes; the host decides what it shows.
 */
public final class AppletActivity extends WindowActivity {
    /** A link the window opens in its applet, for intents from outside the host, such as shortcuts. */
    static final String EXTRA_URL = "url";

    private String appletId;

    @Override String window() { return appletId; }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        appletId = Router.appletId(getIntent());
        if (appletId == null) { finishAndRemoveTask(); return; }
        Shell.applyPrivacy(this, appletId);
        if (!createWindow()) return;
        try {
            send(Bridge.event("appletWindowCreated").put("appletId", appletId).put("restored", savedInstanceState != null));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        // A window Android recreates from its Recents card keeps its first intent; its link was already opened.
        if (savedInstanceState == null) openLink(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openLink(intent);
    }

    /** Intents the host starts carry no link: the host already holds the opening it wants. */
    private void openLink(Intent intent) {
        String url = intent == null ? null : intent.getStringExtra(EXTRA_URL);
        if (url == null || shell == null) return;
        intent.removeExtra(EXTRA_URL);
        shell.openUrl(url, appletId, false);
    }

    /** Shows the applet's name, icon and color on its Recents card. */
    void describeTask(String name, String accent, String icon) {
        setTaskDescription(taskDescription(name, accent, icon));
    }

    @SuppressWarnings("deprecation")
    private static android.app.ActivityManager.TaskDescription taskDescription(String name, String accent, String icon) {
        return new android.app.ActivityManager.TaskDescription(name, AppletIcons.taskIcon(name, accent, icon), AppletIcons.accentColor(accent));
    }

    @Override void windowClosing() {
        try {
            send(Bridge.event("appletWindowClosed").put("appletId", appletId).put("finished", isFinishing()));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }
}
