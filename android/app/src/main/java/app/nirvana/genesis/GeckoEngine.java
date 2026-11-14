package app.nirvana.genesis;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.WebExtension;

/**
 * The one GeckoRuntime of the process, for applets whose websites run in GeckoView. It starts the
 * first time such an applet needs it and stays for the life of the process, shared by every window.
 * An install where no applet uses GeckoView never starts it.
 */
final class GeckoEngine {
    /** The engine id stored in an applet's engine choice and in profile deletion entries. */
    static final String ID = "gecko";
    /** The built-in extension that gives the page agent its bridge; see `assets/genesis-gecko/`. */
    private static final String EXTENSION = "resource://android/assets/genesis-gecko/";
    private static final String EXTENSION_ID = "gecko@genesis.nirvana.app";
    private static GeckoRuntime runtime;
    private static WebExtension extension;
    /** Pages waiting for the extension, which installs once per process. */
    private static List<Consumer<WebExtension>> waiting;

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

    /**
     * Runs `ready` on the main thread with the bridge extension, installing it first if needed. A page
     * loads nothing before then, since its documents could start without their bridge.
     */
    static void extension(Context context, Consumer<WebExtension> ready) {
        if (extension != null) { ready.accept(extension); return; }
        if (waiting != null) { waiting.add(ready); return; }
        waiting = new ArrayList<>(List.of(ready));
        runtime(context).getWebExtensionController().ensureBuiltIn(EXTENSION, EXTENSION_ID).accept(installed -> {
            extension = installed;
            List<Consumer<WebExtension>> pages = waiting;
            waiting = null;
            for (Consumer<WebExtension> page : pages) page.accept(installed);
        }, error -> {
            // Pages stay blank; nothing else can run them in GeckoView.
            Log.e("Genesis", "The GeckoView bridge did not install", error);
            waiting = null;
        });
    }

    /** The system changed its font size or dark theme; a runtime that has not started has nothing to update. */
    static void configurationChanged(android.content.res.Configuration configuration) {
        if (runtime != null) runtime.configurationChanged(configuration);
    }
}
