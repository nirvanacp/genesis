package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import app.nirvana.genesis.ui.Connections;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.LongConsumer;
import org.json.JSONObject;

/**
 * What the manager and every applet window share: their shell, Back, the file chooser, Android
 * permission requests and the lifecycle events they report to the runtime.
 */
abstract class WindowActivity extends Activity implements Shell.Owner {
    private static final int REQUEST_PERMISSIONS = 46100;
    /** Request codes 46100 to 46199 tell one permission request from the one before it. */
    private static final int PERMISSION_REQUESTS = 100;

    GenesisRuntime runtime;
    Shell shell;
    private FileSelection selection;
    private OnBackInvokedCallback backCallback;
    private boolean registered;
    /** The pending Android permission request: its callback and the permissions already held. */
    private Consumer<Set<String>> permissionsWanted;
    private int permissionsRequest;
    private Set<String> permissionsHeld;

    /** The applet this window shows, or null for the manager. */
    abstract String window();

    /**
     * Starts the runtime and builds this window's shell. Returns false when the window cannot
     * run Genesis; it then shows why and reports nothing.
     */
    boolean createWindow() {
        if (!WebFeatures.supported()) {
            Shell.unsupported(this);
            return false;
        }
        runtime = GenesisApp.runtime(this);
        String error = runtime.ensureStarted();
        selection = new FileSelection(this);
        shell = new Shell(this, this, window());
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::back;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        if (error != null) shell.showError(error);
        if (!runtime.attached()) return false;
        runtime.router.attach(shell);
        registered = true;
        return true;
    }

    @Override public void send(JSONObject event) {
        if (registered) runtime.send(event);
    }

    private void back() {
        if (shell.back()) return;
        if (!registered) { moveTaskToBack(true); return; }
        // A revealed context's Back goes to the host too; the WebView never handles Back itself.
        send(GenesisRuntime.windowEvent("back", window()));
    }

    @Override public void launcherShown() { runtime.launcherShown(); }

    @Override public void pickAppletFile() {}

    @Override public Connections.Store connections() { return runtime.services; }

    @Override public void storageSize(LongConsumer result) { runtime.storageSize(result); }

    @Override public boolean chooseFiles(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback, BooleanSupplier valid) {
        selection.open(params, callback, valid);
        return true;
    }

    @Override public void cancelInvalidFiles() { if (selection != null) selection.cancelIfInvalid(); }

    /**
     * One Android request at a time; a newer one interrupts the older one. Each request has its
     * own code, so a late result of the older one is ignored. Android answers an interrupted
     * request with empty results, which is reported as null rather than as a refusal.
     */
    @Override public void requestPermissions(String[] permissions, Consumer<Set<String>> granted) {
        if (permissionsWanted != null) finishPermissions(new String[0], new int[0]);
        Set<String> held = new LinkedHashSet<>();
        List<String> needed = new ArrayList<>();
        for (String permission : permissions) {
            if (checkSelfPermission(permission) == android.content.pm.PackageManager.PERMISSION_GRANTED) held.add(permission);
            else needed.add(permission);
        }
        if (needed.isEmpty()) { granted.accept(held); return; }
        permissionsHeld = held;
        permissionsWanted = granted;
        permissionsRequest = (permissionsRequest + 1) % PERMISSION_REQUESTS;
        requestPermissions(needed.toArray(new String[0]), REQUEST_PERMISSIONS + permissionsRequest);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        int request = requestCode - REQUEST_PERMISSIONS;
        if (request < 0 || request >= PERMISSION_REQUESTS) super.onRequestPermissionsResult(requestCode, permissions, results);
        else if (request == permissionsRequest) finishPermissions(permissions, results);
    }

    private void finishPermissions(String[] permissions, int[] results) {
        Consumer<Set<String>> granted = permissionsWanted;
        Set<String> held = permissionsHeld;
        permissionsWanted = null;
        permissionsHeld = null;
        if (granted == null) return;
        if (results.length == 0) { granted.accept(null); return; }
        for (int i = 0; i < Math.min(permissions.length, results.length); i++) {
            if (results[i] == android.content.pm.PackageManager.PERMISSION_GRANTED) held.add(permissions[i]);
        }
        granted.accept(held);
    }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (selection == null || !selection.result(requestCode, resultCode, data)) super.onActivityResult(requestCode, resultCode, data);
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses the callback registered in createWindow.
    @Override public void onBackPressed() {
        if (shell == null) super.onBackPressed();
        else back();
    }

    @Override protected void onResume() {
        super.onResume();
        if (registered) runtime.windowResumed(shell);
    }

    @Override protected void onPause() {
        if (registered) runtime.windowSuspended(shell);
        super.onPause();
    }

    /** The manifest keeps the activity through rotation and appearance changes, so the applet keeps running. */
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (shell != null) shell.appearanceChanged();
    }

    /** Called from `onDestroy` before the window leaves the router, so the host can still reach it. */
    void windowClosing() {}

    @Override protected void onDestroy() {
        if (registered) {
            windowClosing();
            runtime.router.detach(shell);
            registered = false;
        }
        if (backCallback != null && Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        if (selection != null) selection.cancel();
        if (shell != null) shell.destroy();
        super.onDestroy();
    }
}
