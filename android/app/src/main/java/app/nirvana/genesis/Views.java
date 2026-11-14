package app.nirvana.genesis;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import androidx.webkit.WebViewAssetLoader;
import java.io.File;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import org.json.JSONObject;

/**
 * The shell's record of each applet document and the listener its pages report to. The pages
 * themselves are `WebsitePage`s; `WebViewPage` runs them in Android WebView.
 */
final class Views {
    static final String FOREGROUND_ORIGIN = "https://appassets.androidplatform.net";
    static final String BRIDGE = "__genesisBridge";

    /** What a view reports back to the shell. */
    interface Listener {
        void documentStarted(Page page, String url);
        void documentMessage(Page page, String payload);
        void contextNavigated(Page page, Committed committed);
        /** Starts another app for a tapped link. Returns false when no app can handle it. */
        boolean handOff(android.content.Intent intent);
        void rendererGone(Page page);
        void showFullScreen(Requests.FullScreen screen);
        void hideFullScreen();
        /** The shown website's file input. Returns false when no picker opens; the request is then unanswered. */
        boolean chooseFiles(Page page, Requests.FileRequest request);
        /** The revealed context opened a window from a tap. Returns the popup to load it into, or null to refuse. */
        Page openWindow(Page opener);
        void closeWindow(Page popup);
        /** The revealed context's tapped link asks for a new window at `url`. */
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
        void httpAuth(Page page, Requests.AuthRequest request, String host, String realm);
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

    /** One document the shell keeps: its role and origins, and the engine page that shows it. */
    static final class Page {
        final JSONObject ref;
        final String role;
        final Set<String> origins = new LinkedHashSet<>();
        /** The engine's page; set once by `Views` right after the record is made. */
        WebsitePage tab;

        /** The revealed context that opened this popup; null for the applet's own documents. */
        final Page opener;

        /** The user let this document use the camera or microphone; covering the page reloads it to stop them. */
        boolean capturing;
        /** Downloads this document started; a second one asks first. */
        int downloads;
        /** `SystemClock.uptimeMillis()` of the last trusted input dispatched here; 0 for none. */
        long trustedInputAt;

        /** The profile the page's cookies and permission answers belong to. */
        final SiteData site;

        Page(JSONObject ref, SiteData site) { this(ref, ref.optString("role"), null, site); }

        private Page(JSONObject ref, String role, Page opener, SiteData site) {
            this.ref = ref;
            this.role = role;
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
            android.view.ViewParent parent = tab.view().getParent();
            return parent instanceof PopupSheet || (parent instanceof Revealed && ((View) parent).getVisibility() == View.VISIBLE);
        }

        void post(String payload) { tab.post(payload); }

        void destroy() { tab.destroy(); }
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

    /** A foreground or context page. The bridge listener and start script apply on the page's origins only. */
    Page document(JSONObject ref, Set<String> origins, String startScript, SiteData site) {
        Page page = new Page(ref, site);
        page.origins.addAll(origins);
        page.tab = site instanceof GeckoSites
            ? GeckoPage.document(activity, listener, page, startScript)
            : WebViewPage.document(activity, listener, assets, page, startScript);
        return page;
    }

    /**
     * A window the revealed context opened. It shares the opener's site data and has no bridge or
     * start script. Its own windows load in place, so there is never more than one popup.
     */
    Page popup(Page opener) {
        Page page = new Page(opener.ref, "popup", opener, opener.site);
        page.tab = WebViewPage.popup(activity, listener, page);
        return page;
    }
}
