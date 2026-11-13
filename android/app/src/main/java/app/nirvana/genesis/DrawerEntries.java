package app.nirvana.genesis;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.util.Log;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The app drawer entries of bundled applets. The build adds each one as an alias of
 * `AppletEntryActivity` whose meta-data names the applet. An entry is shown only while its
 * applet is installed and can run on this device, so a removed or incompatible applet leaves
 * the drawer.
 */
final class DrawerEntries {
    private static final String TAG = "GenesisDrawer";

    private final Context app;
    /** Alias component by applet id, read once from the package. */
    private Map<String, ComponentName> aliases;

    DrawerEntries(Context app) {
        this.app = app;
    }

    /** Shows the entries of the applets the launcher lists and can run, and hides the others. */
    void sync(JSONArray entries) {
        Set<String> runnable = new HashSet<>();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.optJSONObject(i);
            if (entry != null && !"incompatible".equals(entry.optString("status"))) runnable.add(entry.optString("appletId"));
        }
        PackageManager packages = app.getPackageManager();
        for (Map.Entry<String, ComponentName> alias : aliases().entrySet()) {
            boolean show = runnable.contains(alias.getKey());
            int state = packages.getComponentEnabledSetting(alias.getValue());
            boolean shown = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
            if (show == shown) continue;
            packages.setComponentEnabledSetting(alias.getValue(),
                show ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
        }
    }

    private Map<String, ComponentName> aliases() {
        if (aliases != null) return aliases;
        aliases = new HashMap<>();
        try {
            PackageInfo info = app.getPackageManager().getPackageInfo(app.getPackageName(),
                PackageManager.GET_ACTIVITIES | PackageManager.GET_META_DATA | PackageManager.MATCH_DISABLED_COMPONENTS);
            for (ActivityInfo activity : info.activities == null ? new ActivityInfo[0] : info.activities) {
                String appletId = activity.metaData == null ? null : activity.metaData.getString(AppletEntryActivity.APPLET_ID);
                if (appletId != null && AppletEntryActivity.class.getName().equals(activity.targetActivity)) {
                    aliases.put(appletId, new ComponentName(app, activity.name));
                }
            }
        } catch (PackageManager.NameNotFoundException impossible) {
            Log.w(TAG, "Could not read the drawer entries", impossible);
        }
        return aliases;
    }
}
