package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebBackForwardList;
import android.webkit.WebHistoryItem;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.Navigation;
import androidx.webkit.NavigationListener;
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
    /** Schemes a context link may hand to another app. Others (intent:, file:, content:, javascript:, data:) do nothing. */
    private static final java.util.List<String> EXTERNAL_SCHEMES = java.util.Arrays.asList("mailto", "tel", "sms", "smsto", "geo");

    /** What a view reports back to the shell. */
    interface Listener {
        void documentStarted(Page page, String url);
        void documentMessage(Page page, String payload);
        void contextNavigated(Page page, Committed committed);
        void openExternal(String url);
        void rendererGone(Page page);
        void showCustomView(View view, WebChromeClient.CustomViewCallback callback);
        void hideCustomView();
        boolean chooseFiles(Page page, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params);
    }

    /** The container a revealed context is reparented into, above the foreground. */
    static final class Revealed extends android.widget.FrameLayout {
        Revealed(android.content.Context context) { super(context); }
    }

    /** A committed navigation of a context, as `ContextNavigated` reports it. */
    static final class Committed {
        String url;
        int index, size;
        boolean sameDocument, reload;

        /** Index-derived: WebView's own canGoBack() counts entries that history.go() would skip. */
        boolean canGoBack() { return index > 0; }
        boolean canGoForward() { return index < size - 1; }
    }

    /** One WebView and the document state the shell keeps for it. */
    static final class Page {
        final JSONObject ref;
        final String role;
        final WebView web;
        final Set<String> origins = new LinkedHashSet<>();
        JavaScriptReplyProxy reply;
        ScriptHandler script;
        /** The last navigation the AndroidX listener reported committed; it precedes doUpdateVisitedHistory. */
        Navigation completed;
        /** Without the listener: an onPageStarted since the last committed navigation. */
        boolean startedSinceCommit;
        int lastIndex = -1;
        String lastUrl;
        /** Counts navigation starts and commits, so a history.go() fallback can see whether anything moved. */
        int moves;

        Page(JSONObject ref, WebView web) {
            this.ref = ref;
            this.role = ref.optString("role");
            this.web = web;
        }

        boolean isForeground() { return "foreground".equals(role); }
        boolean isContext() { return role.startsWith("context:"); }
        /** True exactly while the shell shows this context above the foreground. */
        boolean isRevealed() { return web.getParent() instanceof Revealed; }

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
    private final SiteData site;

    Views(Activity activity, Listener listener, SiteData site) {
        this.activity = activity;
        this.listener = listener;
        this.site = site;
        File applets = new File(activity.getFilesDir(), "applets");
        assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/genesis/", new WebViewAssetLoader.InternalStoragePathHandler(activity, applets))
            .build();
    }

    static String origin(String url) {
        Uri uri = Uri.parse(url);
        if (uri.getScheme() == null || uri.getHost() == null) return "";
        int port = uri.getPort();
        boolean defaultPort = port == -1 || ("https".equals(uri.getScheme()) && port == 443) || ("http".equals(uri.getScheme()) && port == 80);
        return uri.getScheme() + "://" + uri.getHost() + (defaultPort ? "" : ":" + port);
    }

    /** A foreground or context view. The bridge listener and start script apply on the view's origins only. */
    @SuppressLint("RequiresFeature") // WebFeatures.supported() and the NAVIGATION_LISTENER check gate every feature call.
    Page document(JSONObject ref, Set<String> origins, String startScript) {
        WebView web = new WebView(activity);
        WebsiteSettings.apply(web, !"foreground".equals(ref.optString("role")), site);
        Page page = new Page(ref, web);
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
        if (page.isContext()) {
            page.web.setFocusable(false);
            page.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            if (WebFeatures.has(WebViewFeature.NAVIGATION_LISTENER)) {
                WebViewCompat.addNavigationListener(page.web, new NavigationListener() {
                    @Override public void onNavigationStarted(Navigation navigation) { page.moves++; }

                    @Override public void onNavigationCompleted(Navigation navigation) {
                        if (navigation.didCommit()) page.completed = navigation;
                    }
                });
            }
        }
        return page;
    }

    /**
     * Reads the history list and the flags of the navigation that just committed. The listener's
     * navigation describes this commit only when it ended on the same URL; otherwise the flags
     * come from the start and history bookkeeping.
     */
    static Committed committed(Page page) {
        Committed result = new Committed();
        WebBackForwardList list = page.web.copyBackForwardList();
        WebHistoryItem item = list.getCurrentItem();
        result.index = list.getCurrentIndex();
        result.size = list.getSize();
        result.url = item == null ? page.web.getUrl() : item.getUrl();
        if (page.completed != null && result.url != null && result.url.equals(page.completed.getUrl())) {
            result.sameDocument = page.completed.isSameDocument();
            result.reload = page.completed.isReload();
        } else {
            result.sameDocument = !page.startedSinceCommit;
            result.reload = page.startedSinceCommit && result.index == page.lastIndex && result.url != null && result.url.equals(page.lastUrl);
        }
        page.completed = null;
        page.startedSinceCommit = false;
        page.lastIndex = result.index;
        page.lastUrl = result.url;
        return result;
    }

    private final class Client extends WebViewClient {
        private final Page page;

        Client(Page page) { this.page = page; }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            String url = request.getUrl().toString();
            String scheme = request.getUrl().getScheme();
            boolean web = "https".equals(scheme) || "http".equals(scheme);
            if (page.isForeground()) return !FOREGROUND_ORIGIN.equals(origin(url));
            // A context browses any website; the bridge exists only on declared origins.
            if (web) return false;
            if (scheme != null && EXTERNAL_SCHEMES.contains(scheme.toLowerCase(java.util.Locale.ROOT))) listener.openExternal(url);
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return page.isForeground() ? assets.shouldInterceptRequest(request.getUrl()) : null;
        }

        // onPageStarted fires at commit, once per cross-document navigation, with the final URL.
        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (!page.isContext()) return;
            page.startedSinceCommit = true;
            page.moves++;
            listener.documentStarted(page, url);
        }

        // The callback's isReload is wrong for reloads; committed() takes the flags from the listener.
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (!page.isContext()) return;
            page.moves++;
            listener.contextNavigated(page, committed(page));
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
            return page.isRevealed() && listener.chooseFiles(page, callback, params);
        }

        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            if (page.isRevealed()) listener.showCustomView(view, callback);
            else callback.onCustomViewHidden();
        }

        @Override public void onHideCustomView() { listener.hideCustomView(); }
    }
}
