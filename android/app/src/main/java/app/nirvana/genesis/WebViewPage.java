package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.security.KeyChain;
import android.view.View;
import android.webkit.ClientCertRequest;
import android.webkit.GeolocationPermissions;
import android.webkit.HttpAuthHandler;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebBackForwardList;
import android.webkit.WebChromeClient;
import android.webkit.WebHistoryItem;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.Navigation;
import androidx.webkit.NavigationListener;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A page in Android WebView: the applet's foreground, a website context or a popup. It enforces
 * each view's origin policy and reports to the shell through `Views.Listener`.
 */
final class WebViewPage implements WebsitePage {
    /** How long history.go() may take to start moving before the native fallback runs. */
    private static final long HISTORY_FALLBACK_MS = 1000;
    /** How long a page that took a link click has to start moving before the URL loads anyway. */
    private static final long LINK_FALLBACK_MS = 1000;

    /**
     * Offers a navigation to the page as a click on its own link to the URL. A single-page website
     * takes the click and routes inside the document, so its state, such as playing audio, stays.
     * Answers true when the page's script prevented the click's default, or stopped the click before
     * the window, which leaves the page to route or follow the link itself. Otherwise the click is
     * cancelled before the link moves, and the shell loads the URL itself.
     */
    private static final String FOLLOW_LINK = """
        (function (target) {
          try {
            var url = new URL(target);
            if (url.origin !== location.origin) return false;
            var link = Array.prototype.find.call(document.querySelectorAll("a[href]"), function (a) {
              return a.href === url.href && (!a.target || a.target === "_self") && !a.hasAttribute("download");
            });
            if (!link) return false;
            var taken = false;
            var reached = false;
            var last = function (event) {
              reached = true;
              taken = event.defaultPrevented;
              if (!taken) event.preventDefault();
            };
            addEventListener("click", last);
            try {
              link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 }));
            } finally {
              removeEventListener("click", last);
            }
            return !reached || taken;
          } catch (error) {
            return false;
          }
        })""";

    private final Activity activity;
    private final Views.Listener listener;
    private final Views.Page page;
    /** Serves the applet's files to the foreground; null for websites. */
    private final WebViewAssetLoader assets;
    final WebView web;
    /** True for a website context or popup; false for the applet's foreground. */
    private final boolean website;
    private JavaScriptReplyProxy reply;
    private ScriptHandler script;
    /** The last navigation the AndroidX listener reported committed; it precedes doUpdateVisitedHistory. */
    private Navigation completed;
    /** Without the listener: an onPageStarted since the last committed navigation. */
    private boolean startedSinceCommit;
    private int lastIndex = -1;
    private String lastUrl;
    /** Counts navigation starts and commits, so a fallback can see whether anything moved. */
    private int moves;
    private boolean destroyed;

    private WebViewPage(Activity activity, Views.Listener listener, Views.Page page, WebViewAssetLoader assets) {
        this.activity = activity;
        this.listener = listener;
        this.page = page;
        this.assets = assets;
        website = !page.isForeground();
        web = new WebView(activity);
        WebsiteSettings.apply(web, website, page.site);
    }

    /** A foreground or context view. The bridge listener and start script apply on the page's origins only. */
    @SuppressLint("RequiresFeature") // WebFeatures.supported() and the NAVIGATION_LISTENER check gate every feature call.
    static WebViewPage document(Activity activity, Views.Listener listener, WebViewAssetLoader assets, Views.Page page, String startScript) {
        WebViewPage tab = new WebViewPage(activity, listener, page, page.isForeground() ? assets : null);
        WebViewCompat.addWebMessageListener(tab.web, Views.BRIDGE, page.origins, (view, message, sourceOrigin, isMainFrame, reply) -> {
            String data = message.getData();
            if (!isMainFrame || data == null) return;
            tab.reply = reply;
            listener.documentMessage(page, data);
        });
        if (startScript != null) tab.script = WebViewCompat.addDocumentStartJavaScript(tab.web, startScript, page.origins);
        tab.attach();
        if (page.isContext()) {
            tab.web.setFocusable(false);
            tab.web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            if (WebFeatures.has(WebViewFeature.NAVIGATION_LISTENER)) {
                WebViewCompat.addNavigationListener(tab.web, new NavigationListener() {
                    @Override public void onNavigationStarted(Navigation navigation) { tab.moves++; }

                    @Override public void onNavigationCompleted(Navigation navigation) {
                        if (navigation.didCommit()) tab.completed = navigation;
                    }
                });
            }
        }
        return tab;
    }

    /**
     * A window the revealed context opened. It shares the opener's site data and has no bridge or
     * start script. Its own windows load in place, so there is never more than one popup.
     */
    static WebViewPage popup(Activity activity, Views.Listener listener, Views.Page page) {
        WebViewPage tab = new WebViewPage(activity, listener, page, null);
        tab.web.getSettings().setSupportMultipleWindows(false);
        tab.attach();
        return tab;
    }

    private void attach() {
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> listener.download(page, url, userAgent, disposition, mimeType));
    }

    @Override public View view() { return web; }

    @Override public String url() { return web.getUrl(); }

    @Override public void load(String url) { web.loadUrl(url); }

    @Override public void replace(String url) {
        String replace = "(location.replace(" + JSONObject.quote(url) + "), true)";
        web.evaluateJavascript(replace, result -> {
            if (!destroyed && !"true".equals(result)) web.loadUrl(url);
        });
    }

    /**
     * When the page takes the click and starts no navigation within LINK_FALLBACK_MS of the script's
     * callback, the URL loads as before. The time counts from the callback, as in go().
     */
    @Override public void followLink(String url) {
        int before = moves;
        web.evaluateJavascript(FOLLOW_LINK + "(" + JSONObject.quote(url) + ")", result -> {
            if (destroyed) return;
            if (!"true".equals(result)) { web.loadUrl(url); return; }
            web.postDelayed(() -> {
                if (!destroyed && moves == before) web.loadUrl(url);
            }, LINK_FALLBACK_MS);
        });
    }

    /**
     * Moves through history in the page, since WebView's own goBack() skips entries left without
     * a user gesture. If nothing starts moving within a second of the page running the script, the
     * native call runs; when it cannot move either, `unmoved` runs. The second counts from the
     * script's callback, so a busy renderer that has not run the script yet is not taken for a
     * page that cannot move.
     */
    @Override public void go(int delta, Runnable unmoved) {
        int before = moves;
        web.evaluateJavascript("history.go(" + delta + ")", ran -> web.postDelayed(() -> {
            if (destroyed || moves != before) return;
            if (web.canGoBackOrForward(delta)) { web.goBackOrForward(delta); return; }
            unmoved.run();
        }, HISTORY_FALLBACK_MS));
    }

    @Override public void reload() { web.reload(); }

    @Override public History history() {
        WebBackForwardList list = web.copyBackForwardList();
        List<String> urls = new ArrayList<>();
        for (int i = 0; i < list.getSize(); i++) urls.add(list.getItemAtIndex(i).getUrl());
        return new History(list.getCurrentIndex(), list.getSize(), urls);
    }

    @Override public boolean canGoBack() { return web.canGoBack(); }

    @Override public void goBack() { web.goBack(); }

    @SuppressLint("RequiresFeature") // MainActivity checks WEB_MESSAGE_LISTENER before creating any view.
    @Override public void post(String message) {
        if (reply != null) reply.postMessage(message);
    }

    @Override public void input(JSONArray events) throws Input.Refused { Input.dispatch(web, events); }

    /** WebView runs a hidden page as it runs a shown one; the shell's reparenting is enough. */
    @Override public void setRevealed(boolean revealed) {}

    @Override public void configurationChanged() { WebsiteSettings.configurationChanged(web, website); }

    @Override public void destroy() {
        destroyed = true;
        if (script != null) script.remove();
        reply = null;
        web.stopLoading();
        web.setWebChromeClient(null);
        if (web.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) web.getParent()).removeView(web);
        web.destroy();
    }

    /**
     * Reads the history list and the flags of the navigation that just committed. The listener's
     * navigation describes this commit only when it ended on the same URL; otherwise the flags
     * come from the start and history bookkeeping.
     */
    private Views.Committed committed() {
        Views.Committed result = new Views.Committed();
        WebBackForwardList list = web.copyBackForwardList();
        WebHistoryItem item = list.getCurrentItem();
        result.index = list.getCurrentIndex();
        result.size = list.getSize();
        result.url = item == null ? web.getUrl() : item.getUrl();
        if (completed != null && result.url != null && result.url.equals(completed.getUrl())) {
            result.sameDocument = completed.isSameDocument();
            result.reload = completed.isReload();
        } else {
            result.sameDocument = !startedSinceCommit;
            result.reload = startedSinceCommit && result.index == lastIndex && result.url != null && result.url.equals(lastUrl);
        }
        completed = null;
        startedSinceCommit = false;
        lastIndex = result.index;
        lastUrl = result.url;
        return result;
    }

    private final class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            String url = request.getUrl().toString();
            String scheme = request.getUrl().getScheme();
            boolean web = "https".equals(scheme) || "http".equals(scheme);
            if (page.isForeground()) return !Views.FOREGROUND_ORIGIN.equals(Views.origin(url));
            // A context browses any website; the bridge exists only on declared origins.
            if (web) return false;
            // Only the revealed page may hand a link to another app, and only from a tap. A server
            // redirect from a tapped link to mailto: arrives without a gesture and is blocked too.
            if (!SitePolicy.mayHandOff(page, SitePolicy.usersGesture(page, request.hasGesture()))) return true;
            android.content.Intent intent = Handoff.intent(url);
            if (intent == null) return true;
            if (listener.handOff(intent)) return true;
            String fallback = Handoff.fallback(url);
            if (fallback != null) view.loadUrl(fallback);
            else android.widget.Toast.makeText(activity, "No app can open this link", android.widget.Toast.LENGTH_SHORT).show();
            return true;
        }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return assets != null ? assets.shouldInterceptRequest(request.getUrl()) : null;
        }

        // onPageStarted fires at commit, once per cross-document navigation, with the final URL.
        @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
            page.capturing = false;
            page.downloads = 0;
            if (!page.isContext()) return;
            startedSinceCommit = true;
            moves++;
            listener.documentStarted(page, url);
        }

        // The callback's isReload is wrong for reloads; committed() takes the flags from the listener.
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            if (page.opener != null) { listener.popupNavigated(page, url); return; }
            if (!page.isContext()) return;
            moves++;
            listener.contextNavigated(page, committed());
        }

        /** A hidden page can't ask; its server's error page shows, and Reload asks once it is shown. */
        @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
            if (!SitePolicy.mayShowUi(page)) { handler.cancel(); return; }
            listener.httpAuth(page, new Requests.AuthRequest() {
                @Override public void proceed(String user, String password) { handler.proceed(user, password); }
                @Override public void cancel() { handler.cancel(); }
            }, host, realm);
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
            listener.askSite(page, Views.origin(request.getOrigin().toString()), new ArrayList<>(wanted.keySet()), allowed -> {
                if (withdrawn == request) return;
                if (asking == request) asking = null;
                List<String> grant = new ArrayList<>();
                for (Map.Entry<String, String> entry : wanted.entrySet()) if (allowed.contains(entry.getKey())) grant.add(entry.getValue());
                if (!grant.isEmpty()) page.capturing = true;
                if (protectedMedia != null) grant.add(protectedMedia);
                if (grant.isEmpty()) { request.deny(); return; }
                request.grant(grant.toArray(new String[0]));
            });
        }

        /** WebView keeps nothing (`retain` false); `SiteGrants` remembers the answer instead. */
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (!SitePolicy.mayShowUi(page)) { callback.invoke(origin, false, false); return; }
            locating = origin;
            located = callback;
            listener.askSite(page, Views.origin(origin), List.of(SiteGrants.LOCATION), allowed -> {
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
            if (!SitePolicy.mayShowUi(page)) return false;
            int mode = params.getMode();
            boolean open = mode == FileChooserParams.MODE_OPEN || mode == FileChooserParams.MODE_OPEN_MULTIPLE;
            return listener.chooseFiles(page, new Requests.FileRequest(params.getAcceptTypes(),
                mode == FileChooserParams.MODE_OPEN_MULTIPLE, open, callback::onReceiveValue));
        }

        @Override public void onShowCustomView(View view, CustomViewCallback callback) {
            if (SitePolicy.mayShowUi(page)) listener.showFullScreen(new Requests.FullScreen(view, callback::onCustomViewHidden));
            else callback.onCustomViewHidden();
        }

        @Override public void onHideCustomView() { listener.hideFullScreen(); }

        /**
         * Only the revealed context opens a window, and only from a tap; a popup's own windows load
         * in place. A tapped link goes to the host, which opens it in this context, in another
         * applet or in a popup. A script's window, such as a sign-in, opens as a popup at once so
         * it keeps `window.opener`.
         */
        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            if (page.opener != null || !SitePolicy.usersGesture(page, isUserGesture) || !SitePolicy.mayShowUi(page)) return false;
            WebView.HitTestResult hit = view.getHitTestResult();
            String link = hit == null || hit.getType() != WebView.HitTestResult.SRC_ANCHOR_TYPE ? null : hit.getExtra();
            if (link != null && (link.startsWith("https:") || link.startsWith("http:"))) {
                listener.windowRequested(page, link);
                return false;
            }
            Views.Page popup = listener.openWindow(page);
            if (popup == null) return false;
            // A WebView opener's popup is always a WebView page (Views.popup follows the opener's engine).
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(((WebViewPage) popup.tab).web);
            resultMsg.sendToTarget();
            return true;
        }

        @Override public void onCloseWindow(WebView window) { if (page.opener != null) listener.closeWindow(page); }
    }
}
