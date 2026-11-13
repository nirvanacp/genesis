package app.nirvana.genesis;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

/**
 * An invisible trampoline for shortcuts and drawer entries. The launcher starts those with
 * CLEAR_TASK, which would end a running applet's task, so they start this activity instead, and
 * it brings forward the applet's own window with the canonical intent. A shortcut names the
 * applet in its data; a drawer entry is an alias of this activity that names it in its meta-data.
 */
public final class AppletEntryActivity extends Activity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String appletId = Router.appletId(intent);
        if (appletId == null) appletId = aliasApplet(intent.getComponent());
        if (appletId != null) {
            Intent window = Router.appletIntent(this, appletId);
            String url = intent.getStringExtra(AppletActivity.EXTRA_URL);
            if (url != null) window.putExtra(AppletActivity.EXTRA_URL, url);
            startActivity(window);
        }
        finish();
    }

    static final String APPLET_ID = "app.nirvana.genesis.APPLET_ID";

    /** The applet a drawer alias names. `getComponentName()` would give this activity, not the alias. */
    private String aliasApplet(ComponentName component) {
        if (component == null) return null;
        try {
            ActivityInfo info = getPackageManager().getActivityInfo(component, PackageManager.GET_META_DATA);
            return info.metaData == null ? null : info.metaData.getString(APPLET_ID);
        } catch (PackageManager.NameNotFoundException gone) {
            return null;
        }
    }
}
