package app.nirvana.genesis;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import app.nirvana.genesis.ui.Ui;
import java.io.IOException;
import java.net.URLEncoder;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Asks an applet's backend for news: `GET <path>?since=<cursor>` answers
 * `{cursor, notifications: [{id, title, body?, url?}]}`. It shows at most five per run and keeps
 * the new cursor, so the backend decides what is new. Only a network failure is retried; a
 * backend that answers with something else waits for the next run.
 */
public final class NotificationWorker extends Worker {
    private static final String TAG = "GenesisNotifications";
    static final String APPLET_ID = "appletId";

    public NotificationWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    private static String encode(String text) {
        try { return URLEncoder.encode(text, "UTF-8"); }
        catch (java.io.UnsupportedEncodingException error) { throw new IllegalStateException(error); }
    }

    @NonNull @Override public Result doWork() {
        String appletId = getInputData().getString(APPLET_ID);
        Notifications notifications = new Notifications(getApplicationContext());
        JSONObject schedule = appletId == null ? null : notifications.schedule(appletId);
        if (schedule == null || !notifications.on(appletId)) return Result.success();
        String service = Ui.str(schedule, "service"), path = Ui.str(schedule, "path");
        if (service == null || path == null) return Result.success();
        String target = path + (path.contains("?") ? "&" : "?") + "since=" + encode(notifications.cursor(appletId));
        Object answer;
        try {
            answer = ServiceClient.getSync(getApplicationContext(), appletId, service, target);
        } catch (IOException unreachable) {
            Log.i(TAG, appletId + " backend unreachable: " + unreachable.getMessage());
            return Result.retry();
        }
        JSONObject news = answer instanceof JSONObject ? (JSONObject) answer : null;
        Object cursor = news == null ? null : news.opt("cursor");
        JSONArray items = news == null ? null : news.optJSONArray("notifications");
        if (!(cursor instanceof String) || ((String) cursor).length() > Notifications.CURSOR_MAX || items == null) {
            Log.w(TAG, appletId + " backend answered without a usable {cursor, notifications}");
            return Result.success();
        }
        int shown = 0;
        for (int i = 0; i < items.length() && shown < Notifications.PER_RUN_MAX; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            if (notifications.post(appletId, Ui.str(item, "id"), Ui.str(item, "title"), Ui.str(item, "body"), Ui.str(item, "url"))) shown++;
        }
        notifications.saveCursor(appletId, (String) cursor);
        return Result.success();
    }
}
