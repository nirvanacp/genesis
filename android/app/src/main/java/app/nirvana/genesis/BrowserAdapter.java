package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageInfo;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import android.content.Intent;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
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
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
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
    private final Map<String, Bundle> histories = new LinkedHashMap<>();
    private final Map<String, Integer> scrollPositions = new LinkedHashMap<>();
    private String sessionKey;
    private boolean restoredHistory;
    private String pendingScrollUrl;
    private String visibleUrl;
    private Set<String> sourceOrigins = new HashSet<>();
    private final Set<String> homePaths = new HashSet<>();

    BrowserAdapter(Activity activity, HostViews views, HostViews.Events events) {
        this.activity = activity; this.views = views; this.events = events;
    }

    @SuppressLint("SetJavaScriptEnabled")
    void create(JSONObject command) throws Exception {
        if (webView != null) throw new IllegalStateException("Previous browser was not retired");
        long current = command.getLong("generation"); generation = current;
        JSONObject binding = command.getJSONObject("context").getJSONObject("binding");
        sessionKey = binding.getString("kind") + ":" + binding.optString("sourceId", binding.optString("pageId"));
        scrollPositions.clear(); pendingScrollUrl = null; visibleUrl = null;
        sourceOrigins = new HashSet<>();
        homePaths.clear();
        JSONArray declared = command.getJSONArray("origins");
        if ("source".equals(binding.getString("kind"))) for (int i = 0; i < declared.length(); i++) sourceOrigins.add(declared.getString(i));
        if ("source".equals(binding.getString("kind"))) {
            JSONArray sources = command.getJSONObject("package").getJSONObject("manifest").getJSONArray("sources");
            for (int i = 0; i < sources.length(); i++) {
                JSONObject source = sources.getJSONObject(i);
                if (!binding.getString("sourceId").equals(source.getString("id"))) continue;
                JSONArray paths = source.optJSONArray("homePaths");
                if (paths != null) for (int j = 0; j < paths.length(); j++) homePaths.add(paths.getString(j));
                if (homePaths.isEmpty()) homePaths.add(Uri.parse(source.getString("startUrl")).getPath());
                break;
            }
        }
        PackageAssets assets = new PackageAssets(activity.getAssets(), command);
        WebView browser = new WebView(activity); webView = browser;
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(false);
        browser.getSettings().setSupportMultipleWindows(true);
        CookieManager.getInstance().setAcceptCookie(true);
        browser.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                recordScroll(view);
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    if ("appassets.androidplatform.net".equals(request.getUrl().getHost())) {
                        return !"https://appassets.androidplatform.net".equals(originOf(request.getUrl()))
                            || !assets.allowsLocalPath(request.getUrl().getPath());
                    }
                    return false;
                }
                if (request.isForMainFrame()) {
                    if ("mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme)
                        || "geo".equals(scheme) || "intent".equals(scheme)) openHandler(request.getUrl());
                    else views.websiteFailure("No app can open this type of link.");
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if ("appassets.androidplatform.net".equals(request.getUrl().getHost())) {
                    if (!"https://appassets.androidplatform.net".equals(originOf(request.getUrl()))) return PackageAssets.notFound();
                    WebResourceResponse response = assets.loader.shouldInterceptRequest(request.getUrl());
                    return response == null ? PackageAssets.notFound() : response;
                }
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (matches(current)) {
                    recordScroll(view); views.pageLoading(0);
                    Uri starting = Uri.parse(url);
                    if (world != null && sourceOrigins.contains(originOf(starting)))
                        views.pageStarting();
                    updateNavigation(url);
                }
            }
            @Override public void onPageCommitVisible(WebView view, String url) {
                updateNavigation(url); emitUrl("navigated", current, url, false);
            }
            @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                // Also retain ordinary-browsing URLs on providers without NavigationListener.
                updateNavigation(url);
                emitUrl("navigated", current, url, false);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (matches(current)) { views.pageLoading(100); updateNavigation(url); if (!isFeed(url)) restoreScroll(view, url); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame() && matches(current)) siteFailure(current, error.getDescription().toString());
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && matches(current)) siteFailure(current, "Website returned HTTP " + response.getStatusCode());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                emit(HostViews.event("rendererGone"), current); return true;
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) {
                if (matches(current)) views.pageLoading(progress);
            }
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
                if (!matches(current)) return false;
                if (!gesture) { views.websiteFailure("A website popup was blocked. Tap its link to open it."); return false; }
                WebView popup = new WebView(activity);
                final boolean[] handled = { false };
                java.util.function.Consumer<Uri> route = uri -> {
                    if (handled[0]) return;
                    handled[0] = true;
                    String scheme = uri.getScheme();
                    if ("https".equals(scheme) || "http".equals(scheme)) browser.loadUrl(uri.toString());
                    else if ("mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme)
                        || "geo".equals(scheme) || "intent".equals(scheme)) openHandler(uri);
                    else views.websiteFailure("No app can open this type of link.");
                    main.post(popup::destroy);
                };
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        route.accept(request.getUrl()); return true;
                    }
                    @Override public void onPageStarted(WebView ignored, String url, android.graphics.Bitmap icon) { route.accept(Uri.parse(url)); }
                });
                ((WebView.WebViewTransport) result.obj).setWebView(popup); result.sendToTarget();
                return true;
            }
        });
        browser.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (matches(current)) new AlertDialog.Builder(activity)
                .setTitle("Download link")
                .setMessage("Open this download in another app?")
                .setNegativeButton("Stay here", null)
                .setPositiveButton("Open", (dialog, which) -> openHandler(Uri.parse(url)))
                .show();
        });
        browser.setOnScrollChangeListener((view, x, y, oldX, oldY) -> {
            if (visibleUrl != null && isFeed(visibleUrl) && !visibleUrl.equals(pendingScrollUrl))
                scrollPositions.put(visibleUrl, y);
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
        Bundle saved = histories.remove(sessionKey);
        if (saved != null) {
            Bundle positions = saved.getBundle("genesis.scrollPositions");
            if (positions != null) for (String url : positions.keySet()) scrollPositions.put(url, positions.getInt(url));
        }
        restoredHistory = saved != null && browser.restoreState(saved) != null;
        if (restoredHistory) pendingScrollUrl = browser.getUrl();
    }

    void execute(JSONObject command) throws Exception {
        long expected = command.getLong("generation");
        if (!matches(expected)) return;
        switch (command.getString("type")) {
            case "loadUrl": {
                String url = command.getString("url");
                if (restoredHistory) {
                    pendingScrollUrl = url;
                    if (url.equals(webView.getUrl())) {
                        restoredHistory = false; updateNavigation(url); if (!isFeed(url)) restoreScroll(webView, url); break;
                    }
                    WebBackForwardList list = webView.copyBackForwardList();
                    for (int i = list.getCurrentIndex() - 1; i >= 0; i--) {
                        WebHistoryItem item = list.getItemAtIndex(i);
                        if (item != null && url.equals(item.getUrl())) {
                            restoredHistory = false;
                            webView.goBackOrForward(i - list.getCurrentIndex());
                            break;
                        }
                    }
                    if (!restoredHistory) break;
                }
                restoredHistory = false; webView.loadUrl(url); break;
            }
            case "goBack": webView.goBack(); break;
            case "goForward": webView.goForward(); break;
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
    void closeReader() {
        if (webView == null) return;
        android.webkit.WebBackForwardList list = webView.copyBackForwardList();
        for (int i = list.getCurrentIndex() - 1; i >= 0; i--) {
            android.webkit.WebHistoryItem item = list.getItemAtIndex(i);
            if (item != null && isFeed(item.getUrl())) {
                webView.goBackOrForward(i - list.getCurrentIndex()); return;
            }
        }
        if (webView.canGoBack()) webView.goBack();
    }
    void readerAction(String action) {
        String url = webView == null ? null : webView.getUrl();
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) return;
        switch (action) {
            case "copyLink": {
                ClipboardManager manager = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                manager.setPrimaryClip(ClipData.newPlainText("Link", url)); break;
            }
            case "shareLink": {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url);
                activity.startActivity(Intent.createChooser(send, "Share link")); break;
            }
            case "openBrowser": openHandler(Uri.parse(url)); break;
        }
    }
    void saveStates(Bundle out) {
        Bundle all = new Bundle();
        histories.forEach(all::putBundle);
        if (webView != null && sessionKey != null) {
            all.putBundle(sessionKey, saveHistory(webView));
        }
        out.putBundle("genesis.browserHistory", all);
    }
    void onPresentation(String state) {
        if (webView != null && ("ready".equals(state) || "ordinary".equals(state)))
            restoreScroll(webView, webView.getUrl());
    }
    void restoreStates(Bundle state) {
        if (state == null) return;
        Bundle all = state.getBundle("genesis.browserHistory");
        if (all != null) for (String key : all.keySet()) {
            Bundle history = all.getBundle(key); if (history != null) histories.put(key, history);
        }
    }
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
        if (retired != null && sessionKey != null) {
            histories.put(sessionKey, saveHistory(retired));
        }
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
    private boolean isFeed(String url) {
        Uri uri = Uri.parse(url);
        if (!sourceOrigins.contains(originOf(uri))) return false;
        String path = uri.getPath();
        return homePaths.contains(path == null ? "/" : path);
    }
    private String originOf(Uri uri) {
        String scheme = uri.getScheme(), host = uri.getHost();
        if (scheme == null || host == null) return "";
        int port = uri.getPort();
        boolean standardPort = port < 0 || "https".equals(scheme) && port == 443 || "http".equals(scheme) && port == 80;
        return scheme + "://" + host + (standardPort ? "" : ":" + port);
    }
    private void updateNavigation(String url) {
        if (webView == null || url == null) return;
        visibleUrl = url;
        boolean source = !sourceOrigins.isEmpty();
        boolean localPage = sessionKey != null && sessionKey.startsWith("page:");
        boolean reader = source && !isFeed(url) || localPage && !"https://appassets.androidplatform.net".equals(originOf(Uri.parse(url)));
        views.navigation(url, reader, webView.canGoBack(), webView.canGoForward());
    }
    private void recordScroll(WebView view) {
        if (visibleUrl != null && isFeed(visibleUrl) && !visibleUrl.equals(pendingScrollUrl))
            scrollPositions.put(visibleUrl, view.getScrollY());
    }
    private Bundle saveHistory(WebView view) {
        recordScroll(view);
        Bundle history = new Bundle(); view.saveState(history);
        Bundle positions = new Bundle();
        scrollPositions.forEach(positions::putInt);
        history.putBundle("genesis.scrollPositions", positions);
        return history;
    }
    private void restoreScroll(WebView view, String url) {
        if (!url.equals(pendingScrollUrl)) return;
        pendingScrollUrl = null;
        Integer position = scrollPositions.get(url);
        if (position != null && position > 0) view.post(() -> view.scrollTo(0, position));
    }
    private void openHandler(Uri uri) {
        try {
            Intent intent;
            if ("intent".equals(uri.getScheme())) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null); intent.setSelector(null);
            } else intent = new Intent(Intent.ACTION_VIEW, uri);
            activity.startActivity(intent);
        }
        catch (Exception error) { views.websiteFailure("No app can open this link."); }
    }
    private void failure(long current, String message) {
        try { JSONObject event = HostViews.event("loadFailed"); event.put("message", message); emit(event, current); }
        catch (JSONException error) { views.error("Browser failure"); }
    }
    private void siteFailure(long current, String message) {
        views.pageLoading(100);
        try { JSONObject event = HostViews.event("siteFailed"); event.put("message", message); emit(event, current); }
        catch (JSONException error) { views.websiteFailure("Page unavailable"); }
    }
    private void emit(JSONObject event, long current) {
        main.post(() -> {
            if (!matches(current)) return;
            try { event.put("generation", current); events.send(event); }
            catch (JSONException error) { views.error("Browser transport failure"); }
        });
    }
}
