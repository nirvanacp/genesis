package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.JavaScriptExecutionWorld;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.Navigation;
import androidx.webkit.NavigationListener;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebViewRenderProcess;
import androidx.webkit.WebViewRenderProcessClient;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Platform plumbing. Rust decides bindings, presentation, recovery, and source/page selection. */
final class BrowserAdapter {
    private final Activity activity;
    private final HostViews views;
    private final HostViews.Events events;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final LinkedHashMap<Long, JavaScriptReplyProxy> channels = new LinkedHashMap<>();
    private final IdentityHashMap<JavaScriptReplyProxy, Long> channelIds = new IdentityHashMap<>();
    private long nextChannel;
    private WebView webView;
    private long generation;
    private ScriptHandler script;
    private JavaScriptExecutionWorld world;
    private NavigationListener navigation;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;

    BrowserAdapter(Activity activity, HostViews views, HostViews.Events events) {
        this.activity = activity; this.views = views; this.events = events;
    }

    @SuppressLint("SetJavaScriptEnabled")
    void create(JSONObject command) throws Exception {
        if (webView != null) throw new IllegalStateException("Previous browser was not retired");
        long current = command.getLong("generation"); generation = current;
        PackageAssets assets = new PackageAssets(activity.getAssets(), command);
        WebView browser = new WebView(activity); webView = browser;
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(false);
        browser.getSettings().setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    if ("appassets.androidplatform.net".equals(request.getUrl().getHost())) {
                        return !assets.allowsLocalPath(request.getUrl().getPath());
                    }
                    return false;
                }
                if (request.isForMainFrame()) failure(current, "Unsupported navigation scheme: " + scheme);
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if ("appassets.androidplatform.net".equals(request.getUrl().getHost())) {
                    WebResourceResponse response = assets.loader.shouldInterceptRequest(request.getUrl());
                    return response == null ? PackageAssets.notFound() : response;
                }
                return null;
            }
            @Override public void onPageCommitVisible(WebView view, String url) { emitUrl("navigated", current, url, false); }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                // Also retain ordinary-browsing URLs on providers without NavigationListener.
                emitUrl("navigated", current, url, false);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) failure(current, error.getDescription().toString());
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) failure(current, "Website returned HTTP " + response.getStatusCode());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                emit(HostViews.event("rendererGone"), current); return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback callback) {
                if (!matches(current)) { callback.onCustomViewHidden(); return; }
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view; customCallback = callback;
                emit(HostViews.event("fullscreenRequested"), current);
            }
            @Override public void onHideCustomView() { if (matches(current)) exitFullscreen(); }
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.deny();
                if (matches(current)) views.error("Camera and microphone access are unsupported in this MVP.");
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<android.net.Uri[]> callback, FileChooserParams params) {
                callback.onReceiveValue(null);
                if (matches(current)) views.error("File upload is unsupported in this MVP.");
                return true;
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, android.os.Message result) {
                if (matches(current)) views.error("New-window browsing is unsupported in this MVP.");
                return false;
            }
        });
        browser.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (matches(current)) views.error("Downloads are unsupported in this MVP.");
        });
        JSONObject flags = new JSONObject();
        boolean supported = true;
        String[] required = { WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD, WebViewFeature.WEB_MESSAGE_LISTENER,
            WebViewFeature.NAVIGATION_LISTENER, WebViewFeature.WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE, WebViewFeature.WEB_VIEW_RENDERER_TERMINATE };
        for (String flag : required) { boolean available = WebViewFeature.isFeatureSupported(flag); flags.put(flag, available); supported &= available; }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.NAVIGATION_LISTENER)) {
            navigation = new NavigationListener() {
                @Override public void onNavigationStarted(Navigation value) { emitUrl("navigationStarted", current, value.getUrl(), value.isSameDocument()); }
                @Override public void onNavigationRedirected(Navigation value) { emitUrl("navigationStarted", current, value.getUrl(), value.isSameDocument()); }
                @Override public void onNavigationCompleted(Navigation value) {
                    if (value.didCommit()) emitUrl("navigated", current, value.getUrl(), value.isSameDocument());
                }
            };
            WebViewCompat.addNavigationListener(browser, Runnable::run, navigation);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_VIEW_RENDERER_CLIENT_BASIC_USAGE)) {
            WebViewCompat.setWebViewRenderProcessClient(browser, new WebViewRenderProcessClient() {
                @Override public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) { emit(HostViews.event("rendererUnresponsive"), current); }
                @Override public void onRenderProcessResponsive(WebView view, WebViewRenderProcess renderer) { }
            });
        }
        if (supported && command.getBoolean("customized")
            && WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)) {
            Set<String> origins = new HashSet<>();
            JSONArray rules = command.getJSONArray("origins");
            for (int i = 0; i < rules.length(); i++) origins.add(rules.getString(i));
            world = WebViewCompat.getExecutionWorld(browser, "genesis.v1");
            WebViewCompat.addWebMessageListener(browser, "genesisHost", origins, world, (view, message, origin, mainFrame, reply) -> {
                if (!mainFrame || !matches(current) || message.getType() != WebMessageCompat.TYPE_STRING) return;
                String data = message.getData();
                if (data == null || data.length() > 262144) return;
                Long channel = channelIds.get(reply);
                if (channel == null) {
                    channel = ++nextChannel; channelIds.put(reply, channel); channels.put(channel, reply);
                    if (channels.size() > 32) {
                        Long first = channels.keySet().iterator().next(); channelIds.remove(channels.remove(first));
                    }
                }
                try {
                    JSONObject event = HostViews.event("pageMessage");
                    event.put("channel", channel); event.put("origin", origin.toString()); event.put("mainFrame", true); event.put("message", data);
                    emit(event, current);
                } catch (JSONException error) { failure(current, "Bridge transport error"); }
            });
            JSONObject config = new JSONObject(command.getJSONObject("context").toString());
            config.put("revision", command.getJSONObject("package").getString("revision"));
            String injected = "const __GENESIS_BINDING__ = " + config + ";\n" + assets.script(command.getString("entry"));
            script = WebViewCompat.addJavaScriptOnEvent(browser, injected, WebViewCompat.INJECTION_EVENT_DOCUMENT_START, origins, world);
        }
        PackageInfo provider = WebViewCompat.getCurrentWebViewPackage(activity);
        JSONObject capabilities = HostViews.event("capabilities");
        capabilities.put("supported", supported);
        capabilities.put("details", "Android " + Build.VERSION.RELEASE + " / " + Build.SUPPORTED_ABIS[0] + " / " + Locale.getDefault().toLanguageTag()
            + "\nProvider " + (provider == null ? "unavailable" : provider.packageName + " " + provider.versionName) + "\n" + flags.toString(2));
        emit(capabilities, current);
        // The launcher and browser share one slot; do not retain the launcher underneath.
        views.browserSlot.removeAllViews();
        views.browserSlot.addView(browser, new android.widget.FrameLayout.LayoutParams(-1, -1));
    }

    void execute(JSONObject command) throws Exception {
        long expected = command.getLong("generation");
        if (!matches(expected)) return;
        switch (command.getString("type")) {
            case "loadUrl": webView.loadUrl(command.getString("url")); break;
            case "goBack": webView.goBack(); break;
            case "reload": webView.reload(); break;
            case "destroyView": destroy(); break;
            case "deferNavigation": {
                JSONObject event = HostViews.event("activateDestination");
                event.put("documentId", command.getString("documentId"));
                event.put("selection", command.getJSONObject("selection"));
                event.put("url", command.opt("url"));
                // Acknowledgement is posted first; replacement runs on a later UI turn.
                main.post(() -> emit(event, expected)); break;
            }
            case "scheduleModalDeadline": {
                JSONObject event = HostViews.event("modalDeadline");
                event.put("documentId", command.getString("documentId")); event.put("token", command.getLong("token"));
                main.postDelayed(() -> emit(event, expected), 300); break;
            }
            case "scheduleDeadline": {
                JSONObject event = HostViews.event("deadline"); event.put("epoch", command.getLong("epoch"));
                main.postDelayed(() -> emit(event, expected), 5000); break;
            }
            case "challenge": {
                JavaScriptReplyProxy reply = channels.get(command.getLong("channel"));
                if (reply != null && world != null && WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)) {
                    // WebView 156 dereferences the optional receiver. Supply one even though
                    // only the nonce acknowledgement, not the evaluation result, binds a document.
                    reply.executeJavaScript("globalThis.__genesisChallenge?.(" + JSONObject.quote(command.getString("nonce")) + ","
                        + JSONObject.quote(command.getString("challenge")) + ")", result -> {});
                }
                break;
            }
            case "replyToPage": {
                JavaScriptReplyProxy reply = channels.get(command.getLong("channel"));
                if (reply != null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) reply.postMessage(command.getJSONObject("message").toString());
                break;
            }
            case "terminateRenderer":
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_VIEW_RENDERER_TERMINATE)
                    && WebViewFeature.isFeatureSupported(WebViewFeature.GET_WEB_VIEW_RENDERER)) {
                    WebViewRenderProcess renderer = WebViewCompat.getWebViewRenderProcess(webView);
                    if (renderer != null) renderer.terminate();
                }
                break;
            case "showFullscreen": if (customView != null) { webView.setVisibility(View.INVISIBLE); views.fullscreen(customView); } break;
            case "exitFullscreen": exitFullscreen(); break;
            default: throw new IllegalArgumentException("Unknown browser command");
        }
    }

    boolean matches(long expected) { return webView != null && generation == expected; }
    boolean canGoBack() { return webView != null && webView.canGoBack(); }
    void pause() { if (webView != null) webView.onPause(); CookieManager.getInstance().flush(); }
    void resume() { if (webView != null) webView.onResume(); }
    void exitFullscreen() {
        if (customView == null) return;
        View retired = customView; customView = null;
        WebChromeClient.CustomViewCallback callback = customCallback; customCallback = null;
        views.exitFullscreen(retired);
        if (webView != null) webView.setVisibility(View.VISIBLE);
        if (callback != null) callback.onCustomViewHidden();
        emit(HostViews.event("fullscreenClosed"), generation);
    }
    void destroy() {
        exitFullscreen();
        WebView retired = webView; webView = null;
        main.removeCallbacksAndMessages(null);
        channels.clear(); channelIds.clear();
        if (retired != null) {
            if (script != null) { script.remove(); script = null; }
            if (world != null && WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)) {
                WebViewCompat.removeWebMessageListener(retired, world, "genesisHost"); world = null;
            }
            if (navigation != null && WebViewFeature.isFeatureSupported(WebViewFeature.NAVIGATION_LISTENER)) {
                WebViewCompat.removeNavigationListener(retired, navigation); navigation = null;
            }
            views.browserSlot.removeView(retired); retired.stopLoading(); retired.destroy();
        }
    }
    private void emitUrl(String type, long current, String url, boolean sameDocument) {
        try {
            JSONObject event = HostViews.event(type); event.put("url", url); event.put("sameDocument", sameDocument); emit(event, current);
        } catch (JSONException error) { failure(current, "Navigation transport error"); }
    }
    private void failure(long current, String message) {
        try { JSONObject event = HostViews.event("loadFailed"); event.put("message", message); emit(event, current); }
        catch (JSONException error) { views.error("Browser failure"); }
    }
    private void emit(JSONObject event, long current) {
        main.post(() -> {
            if (!matches(current)) return;
            try { event.put("generation", current); events.send(event); }
            catch (JSONException error) { views.error("Browser transport failure"); }
        });
    }
}
