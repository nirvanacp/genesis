package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.view.View;
import android.security.KeyChain;
import android.webkit.ClientCertRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.HttpAuthHandler;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
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
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.json.JSONObject;

/** Creates the applet's WebViews and enforces each view's origin policy. */
final class Views {
    static final String FOREGROUND_ORIGIN = "https://appassets.androidplatform.net";
    static final String BRIDGE = "__genesisBridge";
    /** Where the applet UI previews picked files, on `FOREGROUND_ORIGIN`. */
    static final String PICKED_FILES = "/genesis-files/";
    /** The start of the page agent's blob download messages, which stay in the shell. */
    static final String BLOB_MESSAGE = "{\"type\":\"genesis.blob";

    /** What a view reports back to the shell. */
    interface Listener {
        void documentStarted(Page page, String url);
        void documentMessage(Page page, String payload);

        /** A `genesis.blob` text message: the page agent's answer to the shell's blob download request. */
        void blobMessage(Page page, String payload);

        /** An `ArrayBuffer` from the page agent: the bytes of the blob download it announced. */
        void blobBytes(Page page, byte[] bytes);
        void contextNavigated(Page page, Committed committed);
        /** Starts another app for a tapped link. Returns false when no app can handle it. */
        boolean handOff(android.content.Intent intent);
        void rendererGone(Page page);
        void showCustomView(View view, WebChromeClient.CustomViewCallback callback);
        /**
         * The page is about to use a feature `SitePolicy.mayUse` allowed. A hidden context's grant
         * ends here as used; for the shown website this does nothing.
         */
        void useGrant(Page page);
        void hideCustomView();
        boolean chooseFiles(Page page, ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params);
        /**
         * The revealed context, or a hidden one with a window grant, opened a window from a tap.
         * Returns the popup to load it into, or null to refuse.
         */
        Page openWindow(Page opener);
        void closeWindow(Page popup);
        /** The revealed context's tapped link, or a granted hidden context's, asks for a new window at `url`. */
        void windowRequested(Page page, String url);
        void popupNavigated(Page popup, String url);
        /**
         * The shown website asks to use these `SiteGrants` permissions. `allowed` runs once, on the
         * main thread, with those the user and Android both allowed; empty when refused or cancelled.
         */
        void askSite(Page page, String origin, List<String> permissions, Consumer<Set<String>> allowed);
        /** The website withdrew its question. */
        void cancelAsk();
        /** A page started a download; Android reports no gesture for it. */
        void download(Page page, String url, String userAgent, String disposition, String mimeType);
        /** The shown website's server asks for a username and password. */
        void httpAuth(Page page, HttpAuthHandler handler, String host, String realm);
        /**
         * A hidden context's page opened a JavaScript dialog (`alert`, `confirm`, `prompt` or
         * `beforeunload`) and waits until `result` is answered. `defaultValue` is a prompt's, else null.
         */
        void jsDialog(Page page, String kind, String message, String defaultValue, JsResult result);
        /**
         * The applet UI loads a picked file from `/genesis-files/<id>`. Called on WebView's request
         * thread; unknown ids answer 404.
         */
        WebResourceResponse pickedFile(String id);
    }

    /** The container a revealed context is reparented into, above the foreground. */
    static final class Revealed extends android.widget.FrameLayout {
        Revealed(android.content.Context context) { super(context); }
    }

    /** The container a revealed context's popup shows in, in place of the revealed context. */
    static final class PopupSheet extends android.widget.FrameLayout {
        PopupSheet(android.content.Context context) { super(context); }
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

        /** The revealed context that opened this popup; null for the applet's own documents. */
        final Page opener;

        /** The user let this document use the camera or microphone; covering the page reloads it to stop them. */
        boolean capturing;
        /** Downloads this document started; a second one asks first. */
        int downloads;
        /** `SystemClock.uptimeMillis()` of the last trusted input dispatched here; 0 for none. */
        long trustedInputAt;
        /** The one feature the user let this hidden context use (a `SitePolicy` grant kind), or null. */
        String grant;
        /** `SystemClock.uptimeMillis()` until which `grant` is live. */
        long grantUntil;
        /** Ends `grant` unused when it expires. */
        Runnable grantExpiry;
        /** Until when the window this hidden page opened with its grant may still show; 0 for none. */
        long windowUntil;

        /** The profile the page's cookies and permission answers belong to. */
        final SiteData site;

        Page(JSONObject ref, WebView web, SiteData site) { this(ref, ref.optString("role"), web, null, site); }

        private Page(JSONObject ref, String role, WebView web, Page opener, SiteData site) {
            this.ref = ref;
            this.role = role;
            this.web = web;
            this.opener = opener;
            this.site = site;
        }

        boolean isForeground() { return "foreground".equals(role); }
        boolean isContext() { return role.startsWith("context:"); }
        /**
         * True exactly while the shell shows this context above the foreground, or this popup over it.
         * A context whose popup covers it stays in the hidden `Revealed` container and is not shown.
         */
        boolean isRevealed() {
            android.view.ViewParent parent = web.getParent();
            return parent instanceof PopupSheet || (parent instanceof Revealed && ((View) parent).getVisibility() == View.VISIBLE);
        }

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

    static String origin(String url) {
        Uri uri = Uri.parse(url);
        if (uri.getScheme() == null || uri.getHost() == null) return "";
        int port = uri.getPort();
        boolean defaultPort = port == -1 || ("https".equals(uri.getScheme()) && port == 443) || ("http".equals(uri.getScheme()) && port == 80);
        return uri.getScheme() + "://" + uri.getHost() + (defaultPort ? "" : ":" + port);
    }

    /** A foreground or context view. The bridge listener and start script apply on the view's origins only. */
    @SuppressLint("RequiresFeature") // WebFeatures.supported() and the NAVIGATION_LISTENER check gate every feature call.
    Page document(JSONObject ref, Set<String> origins, String startScript, SiteData site) {
        WebView web = new WebView(activity);
        WebsiteSettings.apply(web, !"foreground".equals(ref.optString("role")), site);
        Page page = new Page(ref, web, site);
        page.origins.addAll(origins);
        WebViewCompat.addWebMessageListener(page.web, BRIDGE, page.origins, (view, message, sourceOrigin, isMainFrame, reply) -> {
            if (!isMainFrame) return;
            // Only the page agent posts bytes, and only for a download the shell asked it to read.
            if (message.getType() == WebMessageCompat.TYPE_ARRAY_BUFFER) {
                if (page.reply == reply) listener.blobBytes(page, message.getArrayBuffer());
                return;
            }
            String data = message.getData();
            if (data == null) return;
            page.reply = reply;
            if (data.startsWith(BLOB_MESSAGE)) listener.blobMessage(page, data);
            else listener.documentMessage(page, data);
        });
        if (startScript != null) page.script = WebViewCompat.addDocumentStartJavaScript(page.web, startScript, page.origins);
        page.web.setWebViewClient(new Client(page));
        page.web.setWebChromeClient(new Chrome(page));
        page.web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> listener.download(page, url, userAgent, disposition, mimeType));
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
     * A window the revealed context opened. It shares the opener's site data and has no bridge or
     * start script. Its own windows load in place, so there is never more than one popup.
     */
    Page popup(Page opener) {
        WebView web = new WebView(activity);
        WebsiteSettings.apply(web, true, opener.site);
        web.getSettings().setSupportMultipleWindows(false);
        Page page = new Page(opener.ref, "popup", web, opener, opener.site);
        web.setWebViewClient(new Client(page));
        web.setWebChromeClient(new Chrome(page));
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> listener.download(page, url, userAgent, disposition, mimeType));
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
            // Only the revealed page may hand a link to another app, and only from a tap. A server
            // redirect from a tapped link to mailto: arrives without a gesture and is blocked too.
            // A hidden context may with a `handoff` grant, which also lifts the block after trusted input.
            if (!SitePolicy.mayHandOff(page, SitePolicy.usersGesture(page, request.hasGesture(), SitePolicy.HANDOFF))) return true;
            listener.useGrant(page);
            android.content.Intent intent = Handoff.intent(url);
            if (intent == null) return true;
            if (listener.handOff(intent)) return true;
            String fallback = Handoff.fallback(url);
            if (fallback != null) view.loadUrl(fallback);
            else android.widget.Toast.makeText(activity, "No app can open this link", android.widget.Toast.LENGTH_SHORT).show();
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            if (!page.isForeground()) return null;
            Uri url = request.getUrl();
            String path = url.getPath();
            if (FOREGROUND_ORIGIN.equals(origin(url.toString())) && path != null && path.startsWith(PICKED_FILES)) {
                return listener.pickedFile(path.substring(PICKED_FILES.length()));
            }
            return assets.shouldInterceptRequest(url);
        }

        // onPageStarted fires at commit, once per cross-document navigation, with the final URL.
        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            page.capturing = false;
            page.downloads = 0;
            if (!page.isContext()) return;
            page.startedSinceCommit = true;
            page.moves++;
            listener.documentStarted(page, url);
        }

        // The callback's isReload is wrong for reloads; committed() takes the flags from the listener.
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (page.opener != null) { listener.popupNavigated(page, url); return; }
            if (!page.isContext()) return;
            page.moves++;
            listener.contextNavigated(page, committed(page));
        }

        /** A hidden page can't ask; its server's error page shows, and Reload asks once it is shown. */
        @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
            if (SitePolicy.mayShowUi(page)) listener.httpAuth(page, handler, host, realm);
            else handler.cancel();
        }

        /**
         * A hidden page's request is ignored rather than cancelled: WebView remembers a cancel for
         * the session, and ignoring lets the site ask again once it is shown.
         */
        @Override public void onReceivedClientCertRequest(WebView view, ClientCertRequest request) {
            if (!SitePolicy.mayShowUi(page)) { request.ignore(); return; }
            KeyChain.choosePrivateKeyAlias(activity, alias -> {
                if (alias == null) { request.cancel(); return; }
                new Thread(() -> {
                    try {
                        java.security.PrivateKey key = KeyChain.getPrivateKey(activity, alias);
                        java.security.cert.X509Certificate[] chain = KeyChain.getCertificateChain(activity, alias);
                        if (key == null || chain == null) request.cancel();
                        else request.proceed(key, chain);
                    } catch (android.security.KeyChainException | InterruptedException error) {
                        request.cancel();
                    }
                }, "genesis-client-cert").start();
            }, request.getKeyTypes(), request.getPrincipals(), request.getHost(), request.getPort(), null);
        }

        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            listener.rendererGone(page);
            return true;
        }
    }

    private final class Chrome extends WebChromeClient {
        private final Page page;

        /** The media request being asked about; null once answered or withdrawn. */
        private PermissionRequest asking;
        /** The origin whose location question is open, or null, and its callback. */
        private String locating;
        private GeolocationPermissions.Callback located;
        /**
         * The question the website is withdrawing while its dialog closes. Every other answer
         * reaches its own request, including one a newer question replaced, which is refused.
         */
        private Object withdrawn;

        Chrome(Page page) { this.page = page; }

        /**
         * Website pages get protected media (EME, such as Widevine) without asking, shown or hidden,
         * like a browser's default. Camera and microphone only for the shown website, after the user
         * allows them. The applet's own page and MIDI are always refused.
         */
        @Override public void onPermissionRequest(PermissionRequest request) {
            boolean website = page.isContext() || page.opener != null;
            String media = null;
            Map<String, String> wanted = new LinkedHashMap<>();
            for (String resource : request.getResources()) {
                if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(resource)) { if (website) media = resource; }
                else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wanted.put(SiteGrants.CAMERA, resource);
                else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wanted.put(SiteGrants.MICROPHONE, resource);
            }
            if (wanted.isEmpty() || !SitePolicy.mayShowUi(page)) {
                if (media != null) request.grant(new String[] {media});
                else request.deny();
                return;
            }
            String protectedMedia = media;
            asking = request;
            listener.askSite(page, origin(request.getOrigin().toString()), new java.util.ArrayList<>(wanted.keySet()), allowed -> {
                if (withdrawn == request) return;
                if (asking == request) asking = null;
                List<String> grant = new java.util.ArrayList<>();
                for (Map.Entry<String, String> entry : wanted.entrySet()) if (allowed.contains(entry.getKey())) grant.add(entry.getValue());
                if (!grant.isEmpty()) page.capturing = true;
                if (protectedMedia != null) grant.add(protectedMedia);
                if (grant.isEmpty()) { request.deny(); return; }
                request.grant(grant.toArray(new String[0]));
            });
        }

        /** WebView keeps nothing (`retain` false); `SiteGrants` remembers the answer instead. */
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!SitePolicy.mayUse(page, SitePolicy.LOCATION)) { callback.invoke(origin, false, false); return; }
            listener.useGrant(page);
            locating = origin;
            located = callback;
            listener.askSite(page, origin(origin), List.of(SiteGrants.LOCATION), allowed -> {
                if (withdrawn == callback) return;
                if (origin.equals(locating)) locating = null;
                callback.invoke(origin, allowed.contains(SiteGrants.LOCATION), false);
            });
        }

        @Override public void onGeolocationPermissionsHidePrompt() {
            if (locating == null) return;
            locating = null;
            withdraw(located);
        }

        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (asking != request) return;
            asking = null;
            withdraw(request);
        }

        private void withdraw(Object question) {
            withdrawn = question;
            try { listener.cancelAsk(); } finally { withdrawn = null; }
        }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            return SitePolicy.mayShowUi(page) && listener.chooseFiles(page, callback, params);
        }

        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            // WebView ignores an exit inside this call, which would leave the page in fullscreen; exit after it.
            if (!SitePolicy.mayUse(page, SitePolicy.FULLSCREEN)) { page.web.post(callback::onCustomViewHidden); return; }
            listener.useGrant(page);
            listener.showCustomView(view, callback);
        }

        @Override public void onHideCustomView() { listener.hideCustomView(); }

        @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
            return hiddenDialog("alert", message, null, result);
        }

        @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
            return hiddenDialog("confirm", message, null, result);
        }

        @Override public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
            return hiddenDialog("prompt", message, defaultValue, result);
        }

        @Override public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
            return hiddenDialog("beforeunload", message, null, result);
        }

        /**
         * A hidden context's dialog goes to the host, which hands it to the applet or reveals the
         * website for it. The shown website, its popup and the applet's own page keep WebView's dialogs.
         */
        private boolean hiddenDialog(String kind, String message, String defaultValue, JsResult result) {
            if (!page.isContext() || page.isRevealed()) return false;
            listener.jsDialog(page, kind, message == null ? "" : message, defaultValue, result);
            return true;
        }

        /**
         * Only the revealed context opens a window, and only from a tap; a popup's own windows load
         * in place. A hidden context may too with a `window` grant, from the trusted tap that used it. A tapped link goes to the host, which opens it in this context, in another
         * applet or in a popup. A script's window, such as a sign-in, opens as a popup at once so
         * it keeps `window.opener`.
         */
        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            if (page.opener != null || !SitePolicy.usersGesture(page, isUserGesture, SitePolicy.WINDOW) || !SitePolicy.mayUse(page, SitePolicy.WINDOW)) return false;
            listener.useGrant(page);
            WebView.HitTestResult hit = view.getHitTestResult();
            String link = hit == null || hit.getType() != WebView.HitTestResult.SRC_ANCHOR_TYPE ? null : hit.getExtra();
            if (link != null && (link.startsWith("https:") || link.startsWith("http:"))) {
                listener.windowRequested(page, link);
                return false;
            }
            Page popup = listener.openWindow(page);
            if (popup == null) return false;
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup.web);
            resultMsg.sendToTarget();
            return true;
        }

        @Override public void onCloseWindow(WebView window) { if (page.opener != null) listener.closeWindow(page); }
    }
}
