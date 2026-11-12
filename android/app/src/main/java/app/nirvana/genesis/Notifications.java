package app.nirvana.genesis;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import app.nirvana.genesis.ui.Ui;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Applet notifications. Each applet has its own channel group, named after it, so Android's
 * settings list its notifications under its name. An applet notifies only after the user turned
 * it on in Applet info. An applet that declares a service and path also has periodic work that
 * asks its backend for news (`NotificationWorker`). Everything the work needs is kept here, in
 * preferences, so it runs without the host.
 */
final class Notifications {
    private static final String TAG = "GenesisNotifications";
    private static final String PREFIX = "applet-notifications/";
    static final int PER_RUN_MAX = 5;
    static final int CURSOR_MAX = 256;
    private static final int INTERVAL_DEFAULT = 60;
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    private final Context app;
    private final SharedPreferences settings;

    Notifications(Context context) {
        app = context.getApplicationContext();
        settings = app.getSharedPreferences("genesis-notifications", Context.MODE_PRIVATE);
    }

    private static String group(String appletId) { return "applet:" + appletId; }
    private static String channel(String appletId) { return group(appletId) + ":updates"; }
    private static String work(String appletId) { return "notifications:" + appletId; }

    /** Whether the user turned the applet's notifications on. */
    boolean on(String appletId) { return settings.getBoolean(PREFIX + appletId, false); }

    /** The applet's name, look, origins and polling, as of the last launcher entries. */
    JSONObject schedule(String appletId) {
        String text = settings.getString(PREFIX + appletId + "/schedule", null);
        if (text == null) return null;
        try { return new JSONObject(text); } catch (JSONException error) { return null; }
    }

    String cursor(String appletId) { return settings.getString(PREFIX + appletId + "/cursor", ""); }

    void saveCursor(String appletId, String cursor) {
        settings.edit().putString(PREFIX + appletId + "/cursor", cursor).apply();
    }

    /** The launcher entry's notification declaration, when the applet runs here and declares one. */
    private static JSONObject declaration(JSONObject entry) {
        return "incompatible".equals(entry.optString("status")) ? null : entry.optJSONObject("notifications");
    }

    private void saveSchedule(JSONObject entry, JSONObject declaration) {
        try {
            JSONObject schedule = new JSONObject()
                .put("name", entry.optString("name"))
                .put("accent", entry.opt("accent"))
                .put("icon", entry.opt("icon"))
                .put("origins", entry.optJSONArray("origins") == null ? new JSONArray() : entry.optJSONArray("origins"))
                .put("service", declaration.opt("service"))
                .put("path", declaration.opt("path"))
                .put("intervalMinutes", declaration.optInt("intervalMinutes", INTERVAL_DEFAULT));
            settings.edit().putString(PREFIX + entry.optString("appletId") + "/schedule", schedule.toString()).apply();
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    /** Turns the applet's notifications on: its channels, and its polling when it has a backend. */
    void turnOn(JSONObject entry) {
        JSONObject declaration = declaration(entry);
        if (declaration == null) return;
        String appletId = entry.optString("appletId");
        saveSchedule(entry, declaration);
        settings.edit().putBoolean(PREFIX + appletId, true).apply();
        createChannels(appletId, entry.optString("name"));
        schedulePolling(appletId);
    }

    /** Turns them off: its notifications and channels go, its polling stops. The cursor stays, so news is not repeated. */
    void turnOff(String appletId) {
        settings.edit().remove(PREFIX + appletId).apply();
        cancelAll(appletId);
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        if (manager != null) manager.deleteNotificationChannelGroup(group(appletId));
        WorkManager.getInstance(app).cancelUniqueWork(work(appletId));
    }

    /** A removed or erased applet's notifications and everything kept for them go with it. */
    void forget(String appletId) {
        turnOff(appletId);
        settings.edit().remove(PREFIX + appletId + "/cursor").remove(PREFIX + appletId + "/schedule").apply();
    }

    /**
     * Keeps every applet's schedule in step with the launcher entries: a new name renames its
     * group, a new interval replaces its work. An applet that no longer declares notifications
     * is turned off; one that is missing or cannot run here stops polling.
     */
    void sync(JSONArray entries) {
        Set<String> listed = new HashSet<>();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry == null) continue;
            String appletId = entry.optString("appletId");
            listed.add(appletId);
            if (!on(appletId)) continue;
            JSONObject declaration = declaration(entry);
            if (declaration == null) {
                if ("incompatible".equals(entry.optString("status"))) WorkManager.getInstance(app).cancelUniqueWork(work(appletId));
                else turnOff(appletId);
                continue;
            }
            JSONObject before = schedule(appletId);
            saveSchedule(entry, declaration);
            if (before == null || !entry.optString("name").equals(before.optString("name"))) createChannels(appletId, entry.optString("name"));
            schedulePolling(appletId);
        }
        for (String key : settings.getAll().keySet()) {
            if (!key.startsWith(PREFIX) || key.indexOf('/', PREFIX.length()) >= 0) continue;
            String appletId = key.substring(PREFIX.length());
            if (!listed.contains(appletId)) WorkManager.getInstance(app).cancelUniqueWork(work(appletId));
        }
    }

    private void createChannels(String appletId, String name) {
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        if (manager == null) return;
        String label = name == null || name.isEmpty() ? appletId : name;
        manager.createNotificationChannelGroup(new NotificationChannelGroup(group(appletId), label));
        NotificationChannel updates = new NotificationChannel(channel(appletId), "Updates", NotificationManager.IMPORTANCE_DEFAULT);
        updates.setGroup(group(appletId));
        manager.createNotificationChannel(updates);
    }

    /** UPDATE keeps the work's timing and replaces its interval when the applet changed it. */
    private void schedulePolling(String appletId) {
        JSONObject schedule = schedule(appletId);
        WorkManager work = WorkManager.getInstance(app);
        if (schedule == null || Ui.str(schedule, "service") == null || Ui.str(schedule, "path") == null) {
            work.cancelUniqueWork(work(appletId));
            return;
        }
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(NotificationWorker.class,
                schedule.optInt("intervalMinutes", INTERVAL_DEFAULT), TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInputData(new Data.Builder().putString(NotificationWorker.APPLET_ID, appletId).build())
            .build();
        work.enqueueUniquePeriodicWork(work(appletId), ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    /**
     * Why Genesis cannot show this notification, or null. The id is 1 to 64 letters, digits,
     * dots, dashes or underscores; the title 1 to 120 characters; the body at most 500; a link
     * is https on one of the applet's websites.
     */
    static String problem(String id, String title, String body, String url, List<String> origins) {
        if (id == null || !ID.matcher(id).matches()) return "id";
        // Characters, not UTF-16 units, as the host counts them.
        if (title == null || title.isEmpty() || title.codePointCount(0, title.length()) > 120) return "title";
        if (body != null && body.codePointCount(0, body.length()) > 500) return "body";
        if (url != null) {
            String origin = httpsOrigin(url);
            boolean declared = false;
            for (String allowed : origins) declared |= origin != null && origin.equals(httpsOrigin(allowed));
            if (!declared) return "url";
        }
        return null;
    }

    /** `https://host[:port]` of an https link, without the default port, or null. */
    private static String httpsOrigin(String url) {
        Uri link = Uri.parse(url);
        if (!"https".equalsIgnoreCase(link.getScheme()) || link.getHost() == null || link.getUserInfo() != null) return null;
        int port = link.getPort();
        return "https://" + link.getHost().toLowerCase(java.util.Locale.ROOT) + (port == -1 || port == 443 ? "" : ":" + port);
    }

    /**
     * Shows one of the applet's notifications, when the user turned them on and Android allows
     * them. Tapping it opens the applet's window, at `url` when there is one. A notification
     * with the same id replaces the earlier one. Returns whether it was shown.
     */
    boolean post(String appletId, String id, String title, String body, String url) {
        JSONObject schedule = schedule(appletId);
        if (!on(appletId) || schedule == null) return false;
        String problem = problem(id, title, body, url, Ui.strings(schedule.optJSONArray("origins")));
        if (problem != null) { Log.w(TAG, appletId + " notification has an invalid " + problem); return false; }
        NotificationManagerCompat manager = NotificationManagerCompat.from(app);
        if (!manager.areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 33 && app.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        String name = Ui.str(schedule, "name");
        createChannels(appletId, name);
        Intent open = Router.appletIntent(app, appletId);
        if (url != null) open.putExtra(AppletActivity.EXTRA_URL, url);
        int code = (appletId + "/" + id).hashCode();
        PendingIntent content = PendingIntent.getActivity(app, code, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(app, channel(appletId))
            .setSmallIcon(R.drawable.ic_stat_genesis)
            .setLargeIcon(AppletIcons.taskIcon(name == null ? appletId : name, Ui.str(schedule, "accent"), Ui.str(schedule, "icon")))
            .setColor(AppletIcons.accentColor(Ui.str(schedule, "accent")))
            .setContentTitle(title)
            .setShortcutId("applet:" + appletId)
            .setContentIntent(content)
            .setAutoCancel(true);
        if (body != null) notification.setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        try {
            manager.notify(group(appletId), id.hashCode(), notification.build());
            return true;
        } catch (SecurityException refused) {
            return false;
        }
    }

    private void cancelAll(String appletId) {
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (android.service.notification.StatusBarNotification shown : manager.getActiveNotifications()) {
            if (group(appletId).equals(shown.getTag())) manager.cancel(shown.getTag(), shown.getId());
        }
    }
}
