package app.nirvana.genesis;

import android.app.Application;
import android.content.pm.ApplicationInfo;
import android.os.Handler;
import android.os.Looper;
import java.io.File;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What every Genesis window shares for the life of the process: the host and its storage
 * results, the service client, the fetcher, the periodic tick and the import scan. Windows report
 * their lifecycle here; the router executes the host's commands on them.
 */
final class GenesisRuntime implements NativeBridge.StorageResults {
    private static final long TICK_MS = 1000;
    private static final long BUNDLE_MAX_BYTES = 64L * 1024 * 1024;
    private static final long COOKIE_MAX_BYTES = 4L * 1024 * 1024;

    final Application app;
    final Handler main = new Handler(Looper.getMainLooper());
    final Files files;
    final ServiceClient services;
    final Fetcher fetcher;
    final Router router;
    private final Bridge bridge;
    private final Runnable tick = this::tick;
    private final Runnable scan = this::scanImports;
    private final boolean debuggable;
    private boolean started, attached;
    /** A setup problem not yet shown in a window. */
    private String setupError;
    private int resumedWindows;

    GenesisRuntime(Application app) {
        this.app = app;
        debuggable = (app.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        files = new Files(app);
        services = new ServiceClient(app, files, this::send);
        fetcher = new Fetcher(app, this::send);
        router = new Router(this);
        bridge = new Bridge(router);
    }

    /**
     * Loads the host, stages the bundled applets and attaches, once per process. Every window
     * calls it from `onCreate`. Returns a setup problem for the calling window to show, or null.
     * When the host could not load, every window shows it.
     */
    String ensureStarted() {
        if (started) {
            String error = attached ? setupError : "Native setup failed: " + setupError;
            setupError = attached ? null : setupError;
            return error;
        }
        started = true;
        // DevTools for debug builds on any device; release builds stay closed.
        android.webkit.WebView.setWebContentsDebuggingEnabled(debuggable);
        try {
            NativeBridge.attach(this);
            String storage = NativeBridge.configureStorage(app.getFilesDir().getAbsolutePath());
            if (!"ok".equals(storage)) setupError = "Storage setup failed: " + storage;
        } catch (RuntimeException | LinkageError error) {
            setupError = String.valueOf(error);
            return "Native setup failed: " + setupError;
        }
        try {
            files.stageBundledApplets();
        } catch (java.io.IOException error) {
            setupError = "Bundled applets could not be prepared: " + error.getMessage();
        }
        // No flow survives a restart, so nothing in the fetch folder is still needed.
        File[] stale = fetcher.directory().listFiles();
        for (File file : stale == null ? new File[0] : stale) if (!file.delete()) file.deleteOnExit();
        attached = true;
        try {
            send(Bridge.event("attach").put("filesDir", app.getFilesDir().getAbsolutePath()).put("debuggable", debuggable));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        String error = setupError;
        setupError = null;
        return error;
    }

    boolean attached() { return attached; }

    void send(JSONObject event) {
        if (attached) bridge.send(event);
    }

    /** Storage worker results, already on the UI thread. */
    @Override public void receive(String result) {
        try { send(Bridge.event("storageCompleted").put("payload", result)); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    // -----------------------------------------------------------------------------------------
    // Window lifecycle

    /** `appletId` is null for the manager window. */
    void windowResumed(Shell shell) {
        if (!attached) return;
        resumedWindows++;
        router.resumed(shell);
        send(windowEvent("resumed", shell.window()));
        main.post(scan);
        tick();
    }

    void windowSuspended(Shell shell) {
        if (!attached) return;
        resumedWindows = Math.max(0, resumedWindows - 1);
        send(windowEvent("suspended", shell.window()));
        if (resumedWindows == 0) main.removeCallbacks(tick);
    }

    static JSONObject windowEvent(String type, String appletId) {
        try { return Bridge.event(type).put("appletId", appletId == null ? JSONObject.NULL : appletId); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    /** The host's clock while any window is in front, including the manager, so it can retire a long-suspended applet. */
    private void tick() {
        main.removeCallbacks(tick);
        if (resumedWindows == 0) return;
        send(Bridge.event("tick"));
        main.postDelayed(tick, TICK_MS);
    }

    void wake(long delayMs) {
        main.postDelayed(() -> send(Bridge.event("tick")), Math.max(0, delayMs));
    }

    // -----------------------------------------------------------------------------------------
    // Imports

    /** Scans for imports, then lets the host run its automatic update check, which it throttles. */
    void launcherShown() {
        main.post(scan);
        main.post(() -> {
            try { send(Bridge.event("checkUpdates").put("appletId", JSONObject.NULL).put("manual", false)); }
            catch (JSONException error) { throw new IllegalStateException(error); }
        });
    }

    /** Hands bundles to the host and credential records to the service client. Runs after the current dispatch. */
    private void scanImports() {
        if (!attached) return;
        for (File file : files.serviceImports()) services.importCredential(file);
        for (File file : files.cookieImports()) importCookies(file);
        for (File file : files.bundledImports()) importBundle(file, "bundled");
        for (File file : files.bundleImports()) importBundle(file, "bundle");
    }

    /** Development cookies from a laptop browser, which only a debug build takes. The file is always deleted. */
    private void importCookies(File file) {
        JSONObject receipt;
        try {
            if (!debuggable) {
                receipt = new JSONObject().put("ok", false).put("error", "Cookie imports need a debug build");
            } else {
                JSONObject payload = new JSONObject(files.read(file, COOKIE_MAX_BYTES));
                int count = Shell.sitesFor(app, payload.optString("appletId", null)).importCookies(payload);
                receipt = new JSONObject().put("ok", true).put("count", count);
            }
        } catch (java.io.IOException | JSONException | RuntimeException error) {
            receipt = null;
            try { receipt = new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage())); }
            catch (JSONException ignored) { /* The CLI times out instead. */ }
        }
        if (receipt != null) files.receipt(file, receipt);
        if (file.exists() && !file.delete()) file.deleteOnExit();
    }

    /** `bundled` is an APK applet with its optional release record; `bundle` is a development import. */
    private void importBundle(File file, String kind) {
        File record = Files.releaseRecord(file);
        try {
            JSONObject event = Bridge.event("importFound").put("kind", kind).put("path", file.getAbsolutePath())
                .put("payload", files.read(file, BUNDLE_MAX_BYTES));
            if (kind.equals("bundled") && record.isFile()) event.put("release", files.read(record, 1024 * 1024));
            send(event);
        } catch (java.io.IOException | JSONException error) {
            if (kind.equals("bundle")) {
                try { files.receipt(file, new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage()))); }
                catch (JSONException ignored) { /* The CLI times out instead. */ }
            } else {
                router.showError(null, "A bundled applet could not be read: " + error.getMessage());
            }
        }
        // The host deletes the bundle; never offer the same file twice.
        if (file.exists() && !file.delete()) file.deleteOnExit();
        if (kind.equals("bundled") && record.exists() && !record.delete()) record.deleteOnExit();
    }

    /** The bytes under the files folder, which holds every applet's bundles and data. */
    void storageSize(java.util.function.LongConsumer result) {
        fetcher.background(() -> {
            long bytes = Files.size(app.getFilesDir());
            fetcher.post(() -> result.accept(bytes));
        });
    }
}
