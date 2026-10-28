package app.nirvana.genesis;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.window.OnBackInvokedDispatcher;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Activity lifecycle, JSON transport, and command execution only. */
public final class MainActivity extends Activity implements NativeBridge.StorageResults {
    private HostViews views;
    private BrowserAdapter browser;
    private boolean attached;
    private String retainedSession;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebView.setWebContentsDebuggingEnabled(false);
        views = new HostViews(this, this::send);
        browser = new BrowserAdapter(this, views, this::send);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> send(HostViews.event("back")));
        }
        try {
            NativeBridge.attach(this);
            String storage = NativeBridge.configureStorage(getFilesDir().getAbsolutePath());
            if (!"ok".equals(storage)) views.error("Storage setup failed: " + storage);
        } catch (Exception | LinkageError error) { views.error("Native setup failed: " + error); return; }
        try (InputStream input = getAssets().open("packages/index.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            JSONObject attach = HostViews.event("attach");
            attach.put("index", new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())));
            attach.put("debug", (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
            if (savedInstanceState != null && savedInstanceState.getString("genesis.session") != null) {
                attach.put("restore", new JSONObject(savedInstanceState.getString("genesis.session")));
            }
            send(attach);
            attached = true;
        } catch (Exception | LinkageError error) { views.error("Genesis startup failed: " + error); }
    }

    @Override public void receive(String result) {
        if (!attached) return;
        try {
            JSONObject event = HostViews.event("storageCompleted"); event.put("completion", new JSONObject(result)); send(event);
        } catch (JSONException error) { views.error("Storage completion encoding failed"); }
    }
    private void send(JSONObject event) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("UI thread required");
        try {
            if ("back".equals(event.getString("type"))) event.put("canGoBack", browser.canGoBack());
            JSONArray commands = new JSONArray(NativeBridge.dispatch(event.toString()));
            for (int i = 0; i < commands.length(); i++) execute(commands.getJSONObject(i));
        } catch (Exception | LinkageError error) { views.error("Genesis host failed: " + error); }
    }

    private void execute(JSONObject command) throws Exception {
        switch (command.getString("type")) {
            case "storageJob": {
                JSONObject job = command.getJSONObject("job");
                if (!NativeBridge.enqueueStorage(job.toString())) {
                    JSONObject reply = new JSONObject().put("v", 1).put("documentId", job.getString("documentId"))
                        .put("requestId", job.getString("requestId")).put("ok", false)
                        .put("error", new JSONObject().put("code", "BUSY").put("message", "Storage queue is full. Retry after rereading.").put("retryable", true));
                    JSONObject completion = new JSONObject(job.toString());
                    completion.remove("operation"); completion.remove("dataSchemaVersion");
                    completion.put("response", reply).put("changed", new JSONArray());
                    receive(completion.toString());
                }
                break;
            }
            case "showLauncher": views.launcher(command.getJSONArray("entries"), command.getString("status")); break;
            case "showError": views.error(command.getString("message")); break;
            case "createView": browser.create(command); break;
            case "presentation": if (browser.matches(command.getLong("generation"))) views.presentation(command); break;
            case "diagnostics": views.diagnostics(command.getString("text")); break;
            case "retainSession": retainedSession = command.getJSONObject("snapshot").toString(); break;
            case "destroyView":
            case "loadUrl":
            case "goBack":
            case "reload":
            case "challenge":
            case "replyToPage":
            case "deferNavigation":
            case "scheduleModalDeadline":
            case "scheduleDeadline":
            case "terminateRenderer":
            case "showFullscreen":
            case "exitFullscreen": browser.execute(command); break;
            case "finishActivity": finish(); break;
            default: throw new IllegalArgumentException("Unknown native command: " + command);
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses the callback registered in onCreate.
    @Override public void onBackPressed() { send(HostViews.event("back")); }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (attached) { send(HostViews.event("saveSession")); out.putString("genesis.session", retainedSession); }
        super.onSaveInstanceState(out);
    }
    @Override protected void onPause() { if (attached) send(HostViews.event("suspended")); if (browser != null) browser.pause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (browser != null) browser.resume(); if (attached) send(HostViews.event("resumed")); }
    @Override protected void onDestroy() {
        NativeBridge.detach(this);
        if (attached) send(HostViews.event("detach"));
        if (browser != null) browser.destroy();
        super.onDestroy();
    }
}
