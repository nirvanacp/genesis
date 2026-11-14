package app.nirvana.genesis.spike.geckobridge;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.WebExtension;

/**
 * Spike: can GeckoView give a Genesis page script the environment WebView gives it? Two sessions
 * (A, visible; B, covered by a view that swallows touches) load the same origin. A built-in
 * extension's document-start content script installs the bridge, connects a native port, and runs
 * the session's own script when Java sends it. Everything is reported to logcat under BridgeSpike.
 * `--es url <url>` picks the page.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "BridgeSpike";
    private static final String EXTENSION_ID = "bridge-spike@genesis.nirvana.app";
    private static GeckoRuntime runtime;

    private final Handler main = new Handler(Looper.getMainLooper());
    private WebExtension extension;
    private String agent;
    private GeckoView viewA, viewB;
    private GeckoSession sessionA, sessionB;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        String url = getIntent().getStringExtra("url");
        if (url == null) url = "https://example.com/";
        agent = asset("test-agent.js");

        FrameLayout root = new FrameLayout(this);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        viewA = new GeckoView(this);
        viewB = new GeckoView(this);
        column.addView(viewA, new LinearLayout.LayoutParams(-1, 0, 1));
        column.addView(viewB, new LinearLayout.LayoutParams(-1, 0, 1));
        root.addView(column, new FrameLayout.LayoutParams(-1, -1));
        // The cover over B, like the shell's foreground over hidden contexts.
        View cover = new View(this);
        cover.setBackgroundColor(0x80FF0000);
        cover.setClickable(true);
        FrameLayout.LayoutParams coverParams = new FrameLayout.LayoutParams(-1, -1);
        root.addView(cover, coverParams);
        root.post(() -> {
            coverParams.topMargin = viewB.getTop();
            cover.setLayoutParams(coverParams);
        });
        setContentView(root);

        if (runtime == null) {
            runtime = GeckoRuntime.create(getApplicationContext(), new GeckoRuntimeSettings.Builder()
                .remoteDebuggingEnabled(true).consoleOutput(true).build());
        }
        final String start = url;
        runtime.getWebExtensionController().ensureBuiltIn("resource://android/assets/bridge/", EXTENSION_ID).accept(ext -> {
            extension = ext;
            Log.i(TAG, "extension ready");
            extension.setMessageDelegate(new WebExtension.MessageDelegate() {
                @Override public GeckoResult<Object> onMessage(String app, Object message, WebExtension.MessageSender sender) {
                    Log.i(TAG, "background: " + message);
                    return null;
                }
            }, "genesis");
            sessionA = session("A", viewA, start);
            sessionB = session("B", viewB, start);
        }, error -> Log.e(TAG, "extension failed", error));
    }

    private GeckoSession session(String name, GeckoView view, String url) {
        GeckoSession session = new GeckoSession();
        session.getWebExtensionController().setMessageDelegate(extension, new WebExtension.MessageDelegate() {
            @Override public void onConnect(WebExtension.Port port) {
                Log.i(TAG, name + " port from " + safe(port.sender.url) + " top=" + port.sender.isTopLevel());
                port.setDelegate(new WebExtension.PortDelegate() {
                    @Override public void onPortMessage(Object message, WebExtension.Port p) { received(name, p, (JSONObject) message); }
                    @Override public void onDisconnect(WebExtension.Port p) { Log.i(TAG, name + " port closed"); }
                });
            }
            @Override public GeckoResult<Object> onMessage(String app, Object message, WebExtension.MessageSender sender) {
                Log.i(TAG, name + " message: " + message);
                return null;
            }
        }, "genesis");
        session.setProgressDelegate(new GeckoSession.ProgressDelegate() {
            @Override public void onPageStart(GeckoSession s, String u) { Log.i(TAG, name + " pageStart " + safe(u)); }
        });
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override public void onLocationChange(GeckoSession s, String u, java.util.List<GeckoSession.PermissionDelegate.ContentPermission> perms, Boolean gesture) {
                Log.i(TAG, name + " location " + safe(u) + " gesture=" + gesture);
            }
        });
        session.setHistoryDelegate(new GeckoSession.HistoryDelegate() {
            @Override public void onHistoryStateChange(GeckoSession s, GeckoSession.HistoryDelegate.HistoryList list) {
                Log.i(TAG, name + " history index=" + list.getCurrentIndex() + " size=" + list.size());
            }
        });
        session.open(runtime);
        view.setSession(session);
        session.setActive(true);
        session.loadUri(url);
        return session;
    }

    private void received(String name, WebExtension.Port port, JSONObject message) {
        try { handle(name, port, message); } catch (JSONException e) { throw new IllegalStateException(e); }
    }

    private void handle(String name, WebExtension.Port port, JSONObject message) throws JSONException {
        String type = message.optString("type");
        switch (type) {
            case "hello" -> {
                Log.i(TAG, name + " stub hello " + message);
                post(port, new JSONObject().put("type", "start").put("code", agent.replace("APPLET", name)));
            }
            case "message" -> {
                String data = message.optString("data");
                Log.i(TAG, name + " page says: " + data);
                if (data.startsWith("agent ")) {
                    post(port, new JSONObject().put("type", "message").put("data", "ping-" + name));
                    JSONObject push = new JSONObject().put("type", "pageEval")
                        .put("code", "history.pushState({}, '', location.pathname + '#pushed-by-page-" + name + "')");
                    main.postDelayed(() -> post(port, push), 500);
                    if ("B".equals(name)) main.postDelayed(this::inputToCovered, 2000);
                }
            }
            default -> Log.i(TAG, name + " " + message);
        }
    }

    /** A tap in the middle of covered view B, then a key press, sent straight to the view. */
    private void inputToCovered() {
        float x = viewB.getWidth() / 2f, y = viewB.getHeight() / 2f;
        long down = SystemClock.uptimeMillis();
        MotionEvent press = MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0);
        MotionEvent release = MotionEvent.obtain(down, down + 50, MotionEvent.ACTION_UP, x, y, 0);
        press.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        release.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        Log.i(TAG, "B tap dispatched=" + viewB.dispatchTouchEvent(press) + "," + viewB.dispatchTouchEvent(release));
        press.recycle();
        release.recycle();
        main.postDelayed(() -> {
            long t = SystemClock.uptimeMillis();
            boolean a = viewB.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_A, 0));
            boolean b = viewB.dispatchKeyEvent(new KeyEvent(t, t + 30, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_A, 0));
            Log.i(TAG, "B key dispatched=" + a + "," + b);
        }, 1000);
    }

    private static void post(WebExtension.Port port, JSONObject message) {
        port.postMessage(message);
    }

    private String asset(String name) {
        try (InputStream in = getAssets().open(name)) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String safe(String url) {
        if (url == null) return "null";
        Uri uri = Uri.parse(url);
        return uri.getScheme() + "://" + uri.getHost() + uri.getPath() + (uri.getFragment() == null ? "" : "#" + uri.getFragment());
    }
}
