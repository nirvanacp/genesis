package app.nirvana.genesis;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.window.OnBackInvokedDispatcher;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Activity lifecycle, JSON transport, and command execution only. */
public final class MainActivity extends Activity implements NativeBridge.StorageResults {
    private FileSelection files;
    private HostViews views;
    private BrowserAdapter browser;
    private ServiceClient services;
    PackageStore packageStore;
    private final java.util.Map<Long, BrowserAdapter> sessions = new java.util.HashMap<>();
    private boolean attached;
    private boolean leavingApproved, leavePrompt;
    private Bundle browserStates = new Bundle();
    private String retainedSession;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        android.webkit.WebView.setWebContentsDebuggingEnabled(false);
        files = new FileSelection(this);
        views = new HostViews(this, this::send);
        services = new ServiceClient(this);
        browser = new BrowserAdapter(this, views, this::send);
        if (savedInstanceState != null) browserStates.putBundle("genesis.browserHistory", savedInstanceState.getBundle("genesis.browserHistory"));
        browser.restoreStates(browserStates);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> send(HostViews.event("back")));
        }
        try {
            NativeBridge.attach(this);
            String storage = NativeBridge.configureStorage(getFilesDir().getAbsolutePath());
            if (!"ok".equals(storage)) views.error("Storage setup failed: " + storage);
        } catch (Exception | LinkageError error) { views.error("Native setup failed: " + error); return; }
        try {
            packageStore = new PackageStore(this);
            JSONObject index = packageStore.load();
            JSONObject attach = HostViews.event("attach");
            attach.put("index", index);
            services.importDevelopment(index.getJSONArray("packages"));
            attach.put("debug", (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
            if (savedInstanceState != null && savedInstanceState.getString("genesis.session") != null) {
                attach.put("restore", new JSONObject(savedInstanceState.getString("genesis.session")));
            }
            send(attach);
            attached = true;
            packageStore.acknowledge();
        } catch (Exception | LinkageError error) { views.error("Genesis startup failed: " + error); }
    }

    @Override public void receive(String result) {
        if (!attached) return;
        try {
            JSONObject event = HostViews.event("storageCompleted"); event.put("completion", new JSONObject(result)); send(event);
        } catch (JSONException error) { views.error("Storage completion encoding failed"); }
    }
    void send(JSONObject event) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("UI thread required");
        try {
            String type = event.getString("type");
            if (!leavingApproved && browser != null && browser.leaveGuard() != null
                && java.util.Arrays.asList("open","openPage","home","reload","retry","ordinary","activateDestination").contains(type)) {
                if (!leavePrompt) {
                    leavePrompt = true;
                    new android.app.AlertDialog.Builder(this).setTitle("Leave this page?").setMessage(browser.leaveGuard())
                        .setNegativeButton("Stay", (dialog, which) -> {}).setPositiveButton("Leave", (dialog, which) -> {
                            leavingApproved = true; try { send(event); } finally { leavingApproved = false; }
                        }).setOnDismissListener(dialog -> leavePrompt = false).show();
                }
                return;
            }
            if ("readerClose".equals(type)) { browser.closeReader(); return; }
            if ("copyLink".equals(type) || "shareLink".equals(type) || "openBrowser".equals(type)) {
                browser.readerAction(type); return;
            }
            if ("back".equals(type) && browser.readerBack()) return;
            if (browser.hasReader() && "forward".equals(type)) { browser.readerForward(); return; }
            if (browser.hasReader() && "reload".equals(type)) { browser.readerReload(); return; }
            if ("back".equals(event.getString("type"))) event.put("canGoBack", browser.canGoBack());
            JSONArray commands = new JSONArray(NativeBridge.dispatch(event.toString()));
            for (int i = 0; i < commands.length(); i++) execute(commands.getJSONObject(i));
        } catch (Exception | LinkageError error) { views.error("Genesis host failed: " + error); }
    }

    private void execute(JSONObject command) throws Exception {
        switch (command.getString("type")) {
            case "serviceRequest": services.request(command.getJSONObject("job")); break;
            case "configureServices": services.configure(command); break;
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
            case "modalState": views.modal(command.getBoolean("open")); break;
            case "replyToPage": { BrowserAdapter target = sessions.get(command.getLong("generation")); if (target != null) target.execute(command); break; }
            case "parkView": browser.pause(); browser.detach(); break;
            case "resumeView":
                browser = sessions.get(command.getLong("generation"));
                if (browser == null) throw new IllegalStateException("Missing browser session");
                browser.attach(); browser.resume(); break;
            case "createView":
                browser = new BrowserAdapter(this, views, this::send);
                browser.restoreStates(browserStates); browser.create(command); sessions.put(command.getLong("generation"), browser); break;
            case "presentation": if (browser.matches(command.getLong("generation"))) {
                browser.onPresentation(command);
            } break;
            case "diagnostics": views.diagnostics(command.getString("text")); break;
            case "retainSession": retainedSession = command.getJSONObject("snapshot").toString(); break;
            case "destroyView": {
                BrowserAdapter retired = sessions.remove(command.getLong("generation"));
                if (retired != null) { retired.saveStates(browserStates); retired.destroy(); } break;
            }
            case "loadUrl":
            case "goBack":
            case "goForward":
            case "reload":
            case "challenge":
            case "deferNavigation":
            case "leaveGuard":
            case "scheduleBackDeadline":
            case "scheduleModalDeadline":
            case "scheduleDeadline":
            case "terminateRenderer":
            case "showFullscreen":
            case "exitFullscreen": browser.execute(command); break;
            case "finishActivity": finish(); break;
            default: throw new IllegalArgumentException("Unknown native command: " + command);
        }
    }

    void cancelInvalidFiles() { if (files != null) files.cancelIfInvalid(); }
    void chooseFiles(android.webkit.WebChromeClient.FileChooserParams params, android.webkit.ValueCallback<android.net.Uri[]> callback, java.util.function.BooleanSupplier valid) {
        files.open(params, callback, valid);
    }
    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        if (!files.result(requestCode, resultCode, data)) super.onActivityResult(requestCode, resultCode, data);
    }
    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses the callback registered in onCreate.
    @Override public void onBackPressed() { send(HostViews.event("back")); }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (attached) { send(HostViews.event("saveSession")); out.putString("genesis.session", retainedSession); }
        for (BrowserAdapter session : sessions.values()) session.saveStates(browserStates);
        out.putBundle("genesis.browserHistory", browserStates.getBundle("genesis.browserHistory"));
        super.onSaveInstanceState(out);
    }
    @Override protected void onPause() { if (attached) send(HostViews.event("suspended")); if (browser != null) browser.pause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (browser != null) browser.resume(); if (attached) send(HostViews.event("resumed")); }
    @Override protected void onDestroy() {
        if (files != null) files.cancel();
        if (views != null) views.dispose();
        if (services != null) services.close();
        NativeBridge.detach(this);
        if (attached) send(HostViews.event("detach"));
        for (BrowserAdapter session : sessions.values()) session.destroy(); sessions.clear();
        super.onDestroy();
    }
}
