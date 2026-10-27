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
public final class MainActivity extends Activity {
    private HostViews views;
    private BrowserAdapter browser;
    private boolean attached;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        views = new HostViews(this, this::send);
        browser = new BrowserAdapter(this, views, this::send);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> send(HostViews.event("back")));
        }
        try (InputStream input = getAssets().open("packages/index.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            JSONObject attach = HostViews.event("attach");
            attach.put("index", new JSONObject(bytes.toString(StandardCharsets.UTF_8.name())));
            send(attach);
            attached = true;
        } catch (Exception | LinkageError error) { views.error("Genesis startup failed: " + error); }
    }

    private void send(JSONObject event) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("UI thread required");
        try {
            if ("back".equals(event.getString("type"))) event.put("canGoBack", browser.canGoBack());
            JSONArray commands = new JSONArray(NativeBridge.dispatch(event.toString()));
            for (int i = 0; i < commands.length(); i++) execute(commands.getJSONObject(i));
        } catch (Exception | LinkageError error) { views.error("Genesis host failed: " + error); }
    }

    private void execute(JSONObject command) throws JSONException {
        switch (command.getString("type")) {
            case "showLauncher": views.launcher(command.getJSONArray("entries"), command.getString("status")); break;
            case "showError": views.error(command.getString("message")); break;
            case "createView": browser.create(command.getLong("generation")); break;
            case "destroyView":
            case "loadUrl":
            case "goBack":
            case "reload": browser.execute(command); break;
            case "finishActivity": finish(); break;
            default: throw new IllegalArgumentException("Unknown native command: " + command);
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // API 33+ uses the callback registered in onCreate.
    @Override public void onBackPressed() { send(HostViews.event("back")); }
    @Override protected void onPause() { if (browser != null) browser.pause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (browser != null) browser.resume(); }
    @Override protected void onDestroy() {
        if (attached) send(HostViews.event("detach"));
        if (browser != null) browser.destroy();
        super.onDestroy();
    }
}
