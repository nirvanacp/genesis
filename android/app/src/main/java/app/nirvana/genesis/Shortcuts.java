package app.nirvana.genesis;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;
import android.widget.Toast;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import app.nirvana.genesis.ui.Ui;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen and launcher shortcuts of applets, with id `applet:<id>`. Every shortcut opens
 * `AppletEntryActivity`, which brings forward the applet's own window. Pinned shortcuts follow
 * the applet's name, icon and status; the launcher keeps the recent applets as dynamic shortcuts,
 * which also offer them in the share sheet.
 */
final class Shortcuts {
    private static final String TAG = "GenesisShortcuts";
    private static final String PREFIX = "applet:";
    private static final String SHARE_LINK = "app.nirvana.genesis.category.SHARE_LINK";
    private static final String PINNED = "app.nirvana.genesis.SHORTCUT_PINNED";

    private final Context app;

    Shortcuts(Context app) {
        this.app = app;
        ContextCompat.registerReceiver(app, new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                Toast.makeText(app, "Added to home screen", Toast.LENGTH_SHORT).show();
            }
        }, new IntentFilter(PINNED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    /** The applet id a shortcut id names, or null. */
    static String appletId(String shortcutId) {
        return shortcutId != null && shortcutId.startsWith(PREFIX) && shortcutId.length() > PREFIX.length() ? shortcutId.substring(PREFIX.length()) : null;
    }

    private static ShortcutInfoCompat.Builder shortcut(Context context, String appletId, String name, String accent, String icon) {
        Intent intent = new Intent(context, AppletEntryActivity.class).setAction(Router.OPEN_APPLET)
            .setData(Router.appletIntent(context, appletId).getData());
        String label = name == null || name.isEmpty() ? appletId : name;
        return new ShortcutInfoCompat.Builder(context, PREFIX + appletId)
            .setShortLabel(label)
            .setLongLabel(label)
            .setIcon(AppletIcons.shortcutIcon(label, accent, icon))
            .setIntent(intent);
    }

    private static ShortcutInfoCompat shortcut(Context context, JSONObject entry) {
        return shortcut(context, entry.optString("appletId"), entry.optString("name"), Ui.str(entry, "accent"), Ui.str(entry, "icon")).build();
    }

    /**
     * Asks the launcher to add the applet to the home screen. The launcher confirms with the
     * user; Genesis says so once it did. `unsupported` runs when the launcher cannot add icons.
     */
    void pin(Context context, JSONObject entry, Runnable unsupported) {
        if (entry == null) return;
        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) { unsupported.run(); return; }
        PendingIntent done = PendingIntent.getBroadcast(app, 0, new Intent(PINNED).setPackage(app.getPackageName()),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            ShortcutManagerCompat.requestPinShortcut(context, shortcut(context, entry), done.getIntentSender());
        } catch (RuntimeException error) {
            Log.w(TAG, "Pin failed", error);
            unsupported.run();
        }
    }

    /** The applet just opened: it leads the launcher's list of recent applets and the share sheet. */
    void opened(String appletId, String name, String accent, String icon) {
        try {
            ShortcutInfoCompat.Builder builder = shortcut(app, appletId, name, accent, icon).setRank(0).setLongLived(true);
            builder.setCategories(Collections.singleton(SHARE_LINK));
            ShortcutManagerCompat.pushDynamicShortcut(app, builder.build());
        } catch (RuntimeException error) {
            Log.w(TAG, "Dynamic shortcut failed", error);
        }
    }

    /**
     * Pinned shortcuts follow the launcher entries: a current applet's shortcut shows its name
     * and icon and opens, an incompatible one is greyed out until it is updated, and one whose
     * applet is gone stays greyed out until the same applet is installed again.
     */
    void update(JSONArray entries) {
        try {
            Map<String, JSONObject> byId = new HashMap<>();
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (entry != null) byId.put(entry.optString("appletId"), entry);
            }
            List<ShortcutInfoCompat> current = new ArrayList<>();
            List<String> incompatible = new ArrayList<>();
            List<String> removed = new ArrayList<>();
            for (ShortcutInfoCompat pinned : ShortcutManagerCompat.getShortcuts(app, ShortcutManagerCompat.FLAG_MATCH_PINNED)) {
                String id = appletId(pinned.getId());
                if (id == null) continue;
                JSONObject entry = byId.get(id);
                if (entry == null) removed.add(pinned.getId());
                else if ("incompatible".equals(entry.optString("status"))) incompatible.add(pinned.getId());
                else current.add(shortcut(app, entry));
            }
            if (!current.isEmpty()) {
                ShortcutManagerCompat.enableShortcuts(app, current);
                ShortcutManagerCompat.updateShortcuts(app, current);
            }
            if (!incompatible.isEmpty()) ShortcutManagerCompat.disableShortcuts(app, incompatible, "Needs an update in Genesis");
            if (!removed.isEmpty()) ShortcutManagerCompat.disableShortcuts(app, removed, "This applet was removed");
            // A dynamic shortcut of an applet that is gone or cannot run leaves the launcher's list.
            List<String> stale = new ArrayList<>();
            for (ShortcutInfoCompat dynamic : ShortcutManagerCompat.getDynamicShortcuts(app)) {
                String id = appletId(dynamic.getId());
                JSONObject entry = id == null ? null : byId.get(id);
                if (entry == null || "incompatible".equals(entry.optString("status"))) stale.add(dynamic.getId());
            }
            if (!stale.isEmpty()) ShortcutManagerCompat.removeDynamicShortcuts(app, stale);
        } catch (RuntimeException error) {
            Log.w(TAG, "Shortcut update failed", error);
        }
    }

    /** A removed or erased applet's shortcuts stop opening it. */
    void forget(String appletId) {
        List<String> ids = Collections.singletonList(PREFIX + appletId);
        try {
            ShortcutManagerCompat.removeDynamicShortcuts(app, ids);
            ShortcutManagerCompat.disableShortcuts(app, ids, "This applet was removed");
        } catch (RuntimeException error) {
            Log.w(TAG, "Shortcut removal failed", error);
        }
    }
}
