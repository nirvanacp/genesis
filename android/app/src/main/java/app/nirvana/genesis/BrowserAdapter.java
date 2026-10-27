package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONException;
import org.json.JSONObject;

/** One ordinary WebView. Script registration starts in MVP-02. */
final class BrowserAdapter {
    private final Activity activity;
    private final HostViews views;
    private final HostViews.Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private long generation;

    BrowserAdapter(Activity activity, HostViews views, HostViews.Events events) {
        this.activity = activity;
        this.views = views;
        this.events = events;
    }

    @SuppressLint("SetJavaScriptEnabled")
    void create(long nextGeneration) {
        if (webView != null) throw new IllegalStateException("Previous browser was not retired");
        generation = nextGeneration;
        WebView browser = new WebView(activity);
        webView = browser;
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(false);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) return false;
                if (request.isForMainFrame()) emit("loadFailed", nextGeneration, "message",
                    "Unsupported navigation scheme: " + scheme);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                if (isCurrent(nextGeneration)) views.browsing();
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                emit("navigated", nextGeneration, "url", url);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) emit("loadFailed", nextGeneration, "message", error.getDescription().toString());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                emit("rendererGone", nextGeneration, null, null);
                return true;
            }
        });
        views.browserSlot.removeAllViews();
        views.browserSlot.addView(browser);
        views.browsing();
    }

    void execute(JSONObject command) throws JSONException {
        long expected = command.getLong("generation");
        if (!isCurrent(expected)) return;
        switch (command.getString("type")) {
            case "loadUrl": webView.loadUrl(command.getString("url")); break;
            case "goBack": webView.goBack(); break;
            case "reload": webView.reload(); break;
            case "destroyView": destroy(); break;
            default: throw new IllegalArgumentException("Unknown browser command");
        }
    }

    boolean canGoBack() { return webView != null && webView.canGoBack(); }
    void pause() { if (webView != null) webView.onPause(); }
    void resume() { if (webView != null) webView.onResume(); }
    void destroy() {
        WebView retired = webView;
        webView = null;
        if (retired != null) {
            views.browserSlot.removeView(retired);
            retired.stopLoading();
            retired.destroy();
        }
    }
    private boolean isCurrent(long expected) { return webView != null && generation == expected; }
    private void emit(String type, long viewGeneration, String key, String value) {
        // Defer so a renderer callback cannot destroy a view on its own stack.
        main.post(() -> {
            if (!isCurrent(viewGeneration)) return;
            JSONObject event = HostViews.event(type);
            try {
                event.put("generation", viewGeneration);
                if (key != null) event.put(key, value);
                events.send(event);
            } catch (JSONException error) { views.error(error.toString()); }
        });
    }
}
