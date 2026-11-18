package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageInfo;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebViewOutcomeReceiver;
import androidx.webkit.WebViewStartUpConfig;
import androidx.webkit.WebViewStartUpResult;
import androidx.webkit.WebViewStartupException;

/** The one place the shell asks which features the installed Android System WebView has. */
final class WebFeatures {
    private WebFeatures() {}

    private static boolean startUpAsked;

    /**
     * Starts the WebView engine on a background thread, once per process, before the first window
     * asks it anything. The engine's own main thread steps still run on the main thread, and the
     * window's first WebView call waits for whatever is not done yet. The `webview_startup`
     * switch off leaves the engine to start on the main thread at its first use, as before.
     */
    @SuppressLint("UnsafeOptInUsageError") // WebViewCompat.ExperimentalAsyncStartUp.
    static void startUp(Context context) {
        if (startUpAsked || Perf.webViewStartUpOff()) return;
        startUpAsked = true;
        WebViewStartUpConfig config = new WebViewStartUpConfig.Builder(task -> new Thread(task, "genesis-webview-start").start()).build();
        WebViewCompat.startUpWebView(context.getApplicationContext(), config, new WebViewOutcomeReceiver<WebViewStartUpResult, WebViewStartupException>() {
            @Override public void onResult(WebViewStartUpResult result) {
                if (Perf.trace()) Perf.log("webviewStartUp mainThreadMs=" + result.getTotalTimeInUiThreadMillis());
            }

            @Override public void onError(WebViewStartupException error) {
                if (Perf.trace()) Perf.log("webviewStartUp failed " + error);
            }
        });
    }

    /** The WebView features the document protocol depends on. */
    static boolean supported() {
        return has(WebViewFeature.WEB_MESSAGE_LISTENER) && has(WebViewFeature.DOCUMENT_START_SCRIPT);
    }

    static boolean has(String feature) {
        return WebViewFeature.isFeatureSupported(feature);
    }

    static String providerVersion(Activity activity) {
        PackageInfo info = WebViewCompat.getCurrentWebViewPackage(activity);
        return info == null ? "unknown" : info.packageName + " " + info.versionName;
    }
}
