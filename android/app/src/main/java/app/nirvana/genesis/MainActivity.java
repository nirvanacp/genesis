package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.io.File;
import java.util.function.BooleanSupplier;
import org.json.JSONException;
import org.json.JSONObject;

/** Lifecycle, Back, the periodic tick and the import scan. Everything else is the host's commands. */
public final class MainActivity extends Activity implements NativeBridge.StorageResults, Shell.Owner, Bridge.Task {
    private static final long TICK_MS = 1000;
    private static final long BUNDLE_MAX_BYTES = 64L * 1024 * 1024;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::tick;
    private final Runnable scan = this::scanImports;
    private FileSelection selection;
    private Files files;
    private ServiceClient services;
    private Shell shell;
    private Bridge bridge;
    private OnBackInvokedCallback backCallback;
    private boolean attached, resumed;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebView.setWebContentsDebuggingEnabled(false);
        if (!Views.supported()) {
            Shell.unsupported(this);
            return;
        }
        selection = new FileSelection(this);
        files = new Files(this);
        shell = new Shell(this, this);
        services = new ServiceClient(this, files, this::send);
        bridge = new Bridge(shell, services, this);
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::back;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        try {
            NativeBridge.attach(this);
            String storage = NativeBridge.configureStorage(getFilesDir().getAbsolutePath());
            if (!"ok".equals(storage)) shell.showError("Storage setup failed: " + storage);
        } catch (RuntimeException | LinkageError error) {
            shell.showError("Native setup failed: " + error);
            return;
        }
        try {
            files.stageBundledApplets();
        } catch (java.io.IOException error) {
            shell.showError("Bundled applets could not be prepared: " + error.getMessage());
        }
        try {
            attached = true;
            send(Bridge.event("attach").put("filesDir", getFilesDir().getAbsolutePath()));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    @Override public void send(JSONObject event) {
        if (attached) bridge.send(event);
    }

    /** Storage worker results, already on the UI thread. */
    @Override public void receive(String result) {
        try { send(Bridge.event("storageCompleted").put("payload", result)); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    private void back() {
        if (shell.closeCustomView()) return;
        if (!attached) { moveTaskToBack(true); return; }
        // A revealed context's Back goes to the host too; the WebView never handles Back itself.
        send(Bridge.event("back"));
    }

    private void tick() {
        main.removeCallbacks(tick);
        if (!resumed) return;
        if (shell.appletShown()) send(Bridge.event("tick"));
        main.postDelayed(tick, TICK_MS);
    }

    @Override public void wake(long delayMs) {
        main.postDelayed(() -> send(Bridge.event("tick")), Math.max(0, delayMs));
    }

    @Override public void moveToBack() { moveTaskToBack(true); }

    /** Hands bundles to the host and credential records to the service client. Runs after the current dispatch. */
    private void scanImports() {
        if (!attached) return;
        for (File file : files.serviceImports()) services.importCredential(file);
        for (File file : files.bundleImports()) {
            try {
                JSONObject event = Bridge.event("importFound").put("kind", "bundle").put("path", file.getAbsolutePath())
                    .put("payload", files.read(file, BUNDLE_MAX_BYTES));
                send(event);
                // The host deletes the file; never offer the same file twice.
                if (file.exists() && !file.delete()) file.deleteOnExit();
            } catch (java.io.IOException | JSONException error) {
                try { files.receipt(file, new JSONObject().put("ok", false).put("error", String.valueOf(error.getMessage()))); }
                catch (JSONException ignored) { /* The CLI times out instead. */ }
                if (!file.delete()) file.deleteOnExit();
            }
        }
    }

    @Override public void launcherShown() { main.post(scan); }

    @Override public void configureServices(String appletId) { services.configure(appletId, files.declaredServices(appletId)); }

    @Override public boolean chooseFiles(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback, BooleanSupplier valid) {
        selection.open(params, callback, valid);
        return true;
    }

    @Override public void cancelInvalidFiles() { selection.cancelIfInvalid(); }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (selection == null || !selection.result(requestCode, resultCode, data)) super.onActivityResult(requestCode, resultCode, data);
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses the callback registered in onCreate.
    @Override public void onBackPressed() {
        if (shell == null) super.onBackPressed();
        else back();
    }

    @Override protected void onResume() {
        super.onResume();
        if (!attached) return;
        resumed = true;
        send(Bridge.event("resumed"));
        main.post(scan);
        tick();
    }

    /** `dev install` starts this activity again; one already in front gets only this call. */
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        main.post(scan);
    }

    @Override protected void onPause() {
        if (attached) {
            resumed = false;
            main.removeCallbacks(tick);
            send(Bridge.event("suspended"));
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        attached = false;
        if (backCallback != null && Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (selection != null) selection.cancel();
        if (services != null) services.close();
        if (shell != null) shell.destroy();
        NativeBridge.detach(this);
        super.onDestroy();
    }
}
