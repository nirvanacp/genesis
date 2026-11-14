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
    /** Pages waiting for the extension, which installs once per process, with what each runs if it fails. */
    private static List<Consumer<WebExtension>> waiting;
    private static List<Runnable> failing;

    private GeckoEngine() {}

    /**
     * The runtime, created on first use. Text follows Android's font size and pages follow its dark
     * theme. Pages load over HTTPS only, as WebView's cleartext block keeps them: Gecko upgrades an
     * `http:` load to HTTPS and shows its error page when the site has none.
     */
    static GeckoRuntime runtime(Context context) {
        if (runtime != null) return runtime;
        boolean debuggable = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        runtime = GeckoRuntime.create(context.getApplicationContext(), new GeckoRuntimeSettings.Builder()
            .remoteDebuggingEnabled(debuggable)
            .consoleOutput(debuggable)
            .automaticFontSizeAdjustment(true)
            .preferredColorScheme(GeckoRuntimeSettings.COLOR_SCHEME_SYSTEM)
            .loginAutofillEnabled(false)
            .allowInsecureConnections(GeckoRuntimeSettings.HTTPS_ONLY)
            .build());
        return runtime;
    }

    /**
     * Runs `ready` on the main thread with the bridge extension, installing it first if needed. A page
     * loads nothing before then, since its documents could start without their bridge. When the
     * install fails, every waiting page's `failed` runs instead, and the next page tries again.
     */
    static void extension(Context context, Consumer<WebExtension> ready, Runnable failed) {
        if (extension != null) { ready.accept(extension); return; }
        if (waiting != null) { waiting.add(ready); failing.add(failed); return; }
        waiting = new ArrayList<>(List.of(ready));
        failing = new ArrayList<>(List.of(failed));
        runtime(context).getWebExtensionController().ensureBuiltIn(EXTENSION, EXTENSION_ID).accept(installed -> {
            extension = installed;
            List<Consumer<WebExtension>> pages = waiting;
            waiting = null;
            failing = null;
            for (Consumer<WebExtension> page : pages) page.accept(installed);
        }, error -> {
            Log.e("Genesis", "The GeckoView bridge did not install", error);
            List<Runnable> pages = failing;
            waiting = null;
            failing = null;
            for (Runnable page : pages) page.run();
        });
    }

    /** The system changed its font size or dark theme; a runtime that has not started has nothing to update. */
    static void configurationChanged(android.content.res.Configuration configuration) {
        if (runtime != null) runtime.configurationChanged(configuration);
    }
}
