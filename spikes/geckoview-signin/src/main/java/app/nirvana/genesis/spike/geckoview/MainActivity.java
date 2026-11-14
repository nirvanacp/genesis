package app.nirvana.genesis.spike.geckoview;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.ArrayDeque;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

/**
 * Spike: does "Continue with Google" work when the website runs in GeckoView inside our own app?
 * `--es engine webview` runs the same page in Android WebView as the control. `--es url <url>`
 * picks the starting page. Popups (`window.open`) open as a new session on top, so
 * `window.opener` keeps working, as Google's sign-in popup needs.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "SignInSpike";
    private static final String DEFAULT_URL = "https://x.com/i/flow/login";
    private static GeckoRuntime runtime;

    private GeckoView geckoView;
    private final ArrayDeque<GeckoSession> sessions = new ArrayDeque<>();
    private WebView webView;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        String url = getIntent().getStringExtra("url");
        if (url == null) url = DEFAULT_URL;
        if ("webview".equals(getIntent().getStringExtra("engine"))) startWebView(url);
        else startGecko(url);
    }

    private void startGecko(String url) {
        if (runtime == null) runtime = GeckoRuntime.create(getApplicationContext());
        geckoView = new GeckoView(this);
        setContentView(geckoView);
        GeckoSession session = newSession();
        session.open(runtime);
        show(session);
        session.loadUri(url);
        Log.i(TAG, "engine=gecko start=" + safe(url));
    }

    private GeckoSession newSession() {
        GeckoSession session = new GeckoSession();
        session.setProgressDelegate(new GeckoSession.ProgressDelegate() {
            @Override public void onPageStart(GeckoSession s, String url) { Log.i(TAG, "gecko page " + safe(url)); }
        });
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override public GeckoResult<GeckoSession> onNewSession(GeckoSession opener, String uri) {
                Log.i(TAG, "gecko popup " + safe(uri));
                GeckoSession popup = newSession();
                show(popup);
                return GeckoResult.fromValue(popup);
            }
        });
        session.setContentDelegate(new GeckoSession.ContentDelegate() {
            @Override public void onCloseRequest(GeckoSession s) { close(s); }
        });
        session.getUserAgent().accept(agent -> Log.i(TAG, "gecko user agent: " + agent));
        return session;
    }

    private void show(GeckoSession session) {
        sessions.push(session);
        geckoView.releaseSession();
        geckoView.setSession(session);
    }

    private void close(GeckoSession session) {
        Log.i(TAG, "gecko popup closed");
        sessions.remove(session);
        session.close();
        geckoView.releaseSession();
        if (!sessions.isEmpty()) geckoView.setSession(sessions.peek());
    }

    private void startWebView(String url) {
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String page, android.graphics.Bitmap icon) { Log.i(TAG, "webview page " + safe(page)); }
        });
        webView.setWebChromeClient(new WebChromeClient());
        setContentView(webView);
        Log.i(TAG, "engine=webview user agent: " + webView.getSettings().getUserAgentString());
        webView.loadUrl(url);
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() {
        if (webView != null) { if (webView.canGoBack()) webView.goBack(); else super.onBackPressed(); return; }
        if (sessions.size() > 1) close(sessions.peek());
        else if (!sessions.isEmpty()) sessions.peek().goBack();
        else super.onBackPressed();
    }

    /** Scheme, host and path only: sign-in URLs can carry an address in their query. */
    private static String safe(String url) {
        if (url == null) return "null";
        Uri uri = Uri.parse(url);
        return uri.getScheme() + "://" + uri.getHost() + uri.getPath();
    }
}
