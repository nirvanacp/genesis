package app.nirvana.genesis;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * An invisible trampoline for shortcuts and drawer entries. The launcher starts those with
 * CLEAR_TASK, which would end a running applet's task, so they start this activity instead, and
 * it brings forward the applet's own window with the canonical intent.
 */
public final class AppletEntryActivity extends Activity {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = getIntent();
        String appletId = Router.appletId(intent);
        if (appletId != null) {
            Intent window = Router.appletIntent(this, appletId);
            String url = intent.getStringExtra(AppletActivity.EXTRA_URL);
            if (url != null) window.putExtra(AppletActivity.EXTRA_URL, url);
            startActivity(window);
        }
        finish();
    }
}
