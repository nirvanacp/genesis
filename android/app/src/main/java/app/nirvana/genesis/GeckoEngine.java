package app.nirvana.genesis;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;

/**
 * The one GeckoRuntime of the process, for applets whose websites run in GeckoView. It starts the
 * first time such an applet needs it and stays for the life of the process, shared by every window.
 * An install where no applet uses GeckoView never starts it.
 */
final class GeckoEngine {
    private static GeckoRuntime runtime;

    private GeckoEngine() {}

    /** The runtime, created on first use. Text follows Android's font size and pages follow its dark theme. */
    static GeckoRuntime runtime(Context context) {
        if (runtime != null) return runtime;
        boolean debuggable = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        runtime = GeckoRuntime.create(context.getApplicationContext(), new GeckoRuntimeSettings.Builder()
            .remoteDebuggingEnabled(debuggable)
            .consoleOutput(debuggable)
            .automaticFontSizeAdjustment(true)
            .preferredColorScheme(GeckoRuntimeSettings.COLOR_SCHEME_SYSTEM)
            .loginAutofillEnabled(false)
            .build());
        return runtime;
    }

    /** The system changed its font size or dark theme; a runtime that has not started has nothing to update. */
    static void configurationChanged(android.content.res.Configuration configuration) {
        if (runtime != null) runtime.configurationChanged(configuration);
    }
}
