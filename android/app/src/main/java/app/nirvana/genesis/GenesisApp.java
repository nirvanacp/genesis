package app.nirvana.genesis;

import android.app.Application;
import android.content.Context;

/** The process: it holds the one runtime every Genesis window shares. */
public final class GenesisApp extends Application {
    private GenesisRuntime runtime;

    /** The process runtime, created on first use. Main thread only. */
    static GenesisRuntime runtime(Context context) {
        GenesisApp app = (GenesisApp) context.getApplicationContext();
        if (app.runtime == null) app.runtime = new GenesisRuntime(app);
        return app.runtime;
    }

    /** The host retires background applets to their resume targets when Android asks for memory. */
    @Override public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (runtime != null) runtime.trimMemory(level);
    }
}
