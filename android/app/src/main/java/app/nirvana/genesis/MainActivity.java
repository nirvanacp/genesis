package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.database.Cursor;
import android.provider.OpenableColumns;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.json.JSONException;
import org.json.JSONObject;

/** Lifecycle, Back, the periodic tick and the import scan. Everything else is the host's commands. */
public final class MainActivity extends Activity implements NativeBridge.StorageResults, Shell.Owner, Bridge.Task {
    private static final long TICK_MS = 1000;
    private static final long BUNDLE_MAX_BYTES = 64L * 1024 * 1024;
    private static final long RELEASE_MAX_BYTES = 1024 * 1024;
    private static final int PICK_APPLET_FILE = 46000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::tick;
    private final Runnable scan = this::scanImports;
    private FileSelection selection;
    private Files files;
    private ServiceClient services;
    private Fetcher fetcher;
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
        fetcher = new Fetcher(this, this::send);
        bridge = new Bridge(shell, services, fetcher, this);
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
        // No flow survives a restart, so nothing in the fetch folder is still needed.
        File[] stale = fetcher.directory().listFiles();
        for (File file : stale == null ? new File[0] : stale) if (!file.delete()) file.deleteOnExit();
        try {
            attached = true;
            boolean debuggable = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
            send(Bridge.event("attach").put("filesDir", getFilesDir().getAbsolutePath()).put("debuggable", debuggable));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        main.post(() -> openedFile(getIntent()));
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
        for (File file : files.bundledImports()) importBundle(file, "bundled");
        for (File file : files.bundleImports()) importBundle(file, "bundle");
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
                shell.showError("A bundled applet could not be read: " + error.getMessage());
            }
        }
        // The host deletes the bundle; never offer the same file twice.
        if (file.exists() && !file.delete()) file.deleteOnExit();
        if (kind.equals("bundled") && record.exists() && !record.delete()) record.deleteOnExit();
    }

    /** Scans for imports, then lets the host run its automatic update check, which it throttles. */
    @Override public void launcherShown() {
        main.post(scan);
        main.post(() -> {
            try { send(Bridge.event("checkUpdates").put("appletId", JSONObject.NULL).put("manual", false)); }
            catch (JSONException error) { throw new IllegalStateException(error); }
        });
    }

    @Override public void pickAppletFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(intent, PICK_APPLET_FILE); }
        catch (android.content.ActivityNotFoundException error) { shell.showError("No app can pick files on this phone."); }
    }

    /** A bundle another app opened or shared with Genesis. The intent is consumed so it runs once. */
    private void openedFile(Intent intent) {
        if (intent == null || !attached) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) uris.add(intent.getData());
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri stream = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : streamExtra(intent);
            if (stream != null) uris.add(stream);
        }
        if (uris.isEmpty()) return;
        setIntent(new Intent(this, MainActivity.class));
        reviewFiles(uris);
    }

    @SuppressWarnings("deprecation")
    private static Uri streamExtra(Intent intent) { return intent.getParcelableExtra(Intent.EXTRA_STREAM); }

    /**
     * Copies the picked bundle into the fetch folder, reads a picked release record, and asks the
     * host to review them. The copy runs on the fetch thread.
     */
    private void reviewFiles(List<Uri> uris) {
        ContentResolver resolver = getContentResolver();
        File directory = fetcher.directory();
        fetcher.background(() -> {
            File bundle = null;
            String release = null, error = null;
            try {
                for (Uri uri : uris) {
                    if (!"content".equals(uri.getScheme())) throw new java.io.IOException("Genesis opens only files shared by another app");
                    String name = displayName(resolver, uri);
                    if (name != null && name.endsWith(".release.json")) {
                        if (release != null) throw new java.io.IOException("Pick one release record");
                        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                        try (java.io.InputStream input = resolver.openInputStream(uri)) {
                            if (input == null) throw new java.io.IOException("Cannot open " + name);
                            Fetcher.copy(input, bytes, RELEASE_MAX_BYTES);
                        }
                        release = new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
                        continue;
                    }
                    if (bundle != null) throw new java.io.IOException("Pick one applet bundle at a time");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("Cannot create " + directory);
                    bundle = new File(directory, "file-" + java.util.UUID.randomUUID() + ".bundle.json");
                    File part = new File(directory, bundle.getName() + ".part");
                    try (java.io.InputStream input = resolver.openInputStream(uri); java.io.OutputStream output = new java.io.FileOutputStream(part)) {
                        if (input == null) throw new java.io.IOException("Cannot open " + (name == null ? "the file" : name));
                        Fetcher.copy(input, output, BUNDLE_MAX_BYTES);
                    } catch (java.io.IOException failed) {
                        if (!part.delete()) part.deleteOnExit();
                        throw failed;
                    }
                    if (!part.renameTo(bundle)) throw new java.io.IOException("Cannot save the file");
                }
                if (bundle == null) throw new java.io.IOException("Pick the applet's .bundle.json file");
            } catch (java.io.IOException | SecurityException failed) {
                error = failed.getMessage();
                if (bundle != null && !bundle.delete()) bundle.deleteOnExit();
                bundle = null;
            }
            String path = bundle == null ? null : bundle.getAbsolutePath(), record = release, message = error;
            fetcher.post(() -> {
                if (path == null) { shell.showError("Genesis could not read the file: " + message); return; }
                try { send(Bridge.event("reviewFile").put("path", path).put("release", record == null ? JSONObject.NULL : record)); }
                catch (JSONException failed) { throw new IllegalStateException(failed); }
            });
        });
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (RuntimeException ignored) { /* Treated as a bundle. */ }
        return uri.getLastPathSegment();
    }

    @Override public void configureServices(String appletId) { services.configure(appletId, files.declaredServices(appletId)); }

    @Override public boolean chooseFiles(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> callback, BooleanSupplier valid) {
        selection.open(params, callback, valid);
        return true;
    }

    @Override public void cancelInvalidFiles() { selection.cancelIfInvalid(); }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_APPLET_FILE) {
            if (resultCode != RESULT_OK || data == null) return;
            List<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) for (int i = 0; i < Math.min(clip.getItemCount(), 2); i++) uris.add(clip.getItemAt(i).getUri());
            else if (data.getData() != null) uris.add(data.getData());
            if (clip != null && clip.getItemCount() > 2) { shell.showError("Pick an applet bundle, and its release record if you have one."); return; }
            if (!uris.isEmpty()) reviewFiles(uris);
            return;
        }
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
        main.post(() -> openedFile(getIntent()));
    }

    /** The manifest keeps the activity through rotation and appearance changes, so the applet keeps running. */
    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        if (shell != null) shell.appearanceChanged();
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
        if (fetcher != null) fetcher.close();
        if (shell != null) shell.destroy();
        NativeBridge.detach(this);
        super.onDestroy();
    }
}
