package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.pm.PackageInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.LinkedHashSet;
import java.util.Set;
import org.json.JSONObject;

/** Creates the applet's WebViews and enforces each view's origin policy. */
final class Views {
    static final String FOREGROUND_ORIGIN = "https://appassets.androidplatform.net";
    static final String BRIDGE = "__genesisBridge";

    /** What a view reports back to the shell. */
    interface Listener {
        void documentLoaded(Page page, String url);
        void documentMessage(Page page, String payload);
        void websiteUrlChanged(String url);
        void openExternal(String url);
        void rendererGone(Page page);
        void showCustomView(View view, WebChromeClient.CustomViewCallback callback);
        void hideCustomView();
        boolean chooseFiles(Page page, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params);
    }

    /** One WebView and the document state the shell keeps for it. */
    static final class Page {
        final JSONObject ref;
        final String role;
        final WebView web;
        final Set<String> origins = new LinkedHashSet<>();
        JavaScriptReplyProxy reply;
        ScriptHandler script;

        Page(JSONObject ref, WebView web) {
            this.ref = ref;
            this.role = ref.optString("role");
            this.web = web;
        }

        boolean isForeground() { return "foreground".equals(role); }
        boolean isWebsite() { return "website".equals(role); }

        @SuppressLint("RequiresFeature") // MainActivity checks WEB_MESSAGE_LISTENER before creating any view.
        void post(String payload) {
            if (reply != null) reply.postMessage(payload);
        }

        void destroy() {
            if (script != null) script.remove();
            reply = null;
            web.stopLoading();
            web.setWebChromeClient(null);
            if (web.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
    }

    private final Activity activity;
    private final Listener listener;
    private final WebViewAssetLoader assets;

    Views(Activity activity, Listener listener) {
        this.activity = activity;
        this.listener = listener;
        File applets = new File(activity.getFilesDir(), "applets");
        assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/genesis/", new WebViewAssetLoader.InternalStoragePathHandler(activity, applets))
            .build();
    }

    /** The WebView features the document protocol depends on. */
    static boolean supported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
            && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT);
    }

    static String providerVersion(Activity activity) {
        PackageInfo info = WebViewCompat.getCurrentWebViewPackage(activity);
        return info == null ? "unknown" : info.packageName + " " + info.versionName;
    }

    static String origin(String url) {
        Uri uri = Uri.parse(url);
        if (uri.getScheme() == null || uri.getHost() == null) return "";
        int port = uri.getPort();
        boolean defaultPort = port == -1 || ("https".equals(uri.getScheme()) && port == 443) || ("http".equals(uri.getScheme()) && port == 80);
        return uri.getScheme() + "://" + uri.getHost() + (defaultPort ? "" : ":" + port);
    }

    /** A foreground or source view. The bridge listener and start script apply on the view's origins only. */
    @SuppressLint("RequiresFeature")
    Page document(JSONObject ref, Set<String> origins, String startScript) {
        Page page = new Page(ref, base(!"foreground".equals(ref.optString("role"))));
        page.origins.addAll(origins);
        WebViewCompat.addWebMessageListener(page.web, BRIDGE, page.origins, (view, message, sourceOrigin, isMainFrame, reply) -> {
            String data = message.getData();
            if (!isMainFrame || data == null) return;
            page.reply = reply;
            listener.documentMessage(page, data);
        });
        if (startScript != null) page.script = WebViewCompat.addDocumentStartJavaScript(page.web, startScript, page.origins);
        page.web.setWebViewClient(new Client(page));
        page.web.setWebChromeClient(new Chrome(page));
        if (!page.isForeground()) {
            page.web.setFocusable(false);
            page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
        return page;
    }

    /** The website sheet: the user's own browsing on the declared origins plus the origin it opened at. */
    Page website(JSONObject ref, Set<String> origins) {
        Page page = new Page(ref, base(true));
        page.origins.addAll(origins);
        page.web.setWebViewClient(new Client(page));
        page.web.setWebChromeClient(new Chrome(page));
        return page;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView base(boolean websiteCookies) {
        WebView web = new WebView(activity);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        web.setBackgroundColor(Color.WHITE);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, websiteCookies);
        return web;
    }

    private final class Client extends WebViewClient {
        private final Page page;

        Client(Page page) { this.page = page; }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            String url = request.getUrl().toString();
            String scheme = request.getUrl().getScheme();
            boolean allowed = page.isForeground()
                ? FOREGROUND_ORIGIN.equals(origin(url))
                : "https".equals(scheme) && page.origins.contains(origin(url));
            if (allowed) return false;
            // Source views stay on declared origins; the foreground leaves only through website.open.
            if (page.isWebsite() && ("https".equals(scheme) || "http".equals(scheme))) listener.openExternal(url);
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return page.isForeground() ? assets.shouldInterceptRequest(request.getUrl()) : null;
        }

        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (!page.isWebsite()) listener.documentLoaded(page, url);
        }

        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (page.isWebsite()) listener.websiteUrlChanged(url);
        }

        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            listener.rendererGone(page);
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        private final Page page;

        Chrome(Page page) { this.page = page; }

        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            return page.isWebsite() && listener.chooseFiles(page, callback, params);
        }

        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            if (page.isWebsite()) listener.showCustomView(view, callback);
            else callback.onCustomViewHidden();
        }

        @Override public void onHideCustomView() { listener.hideCustomView(); }
    }
}
