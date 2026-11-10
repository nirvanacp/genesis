package app.nirvana.genesis;

import android.app.Activity;
import android.content.pm.PackageInfo;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

/** The one place the shell asks which features the installed Android System WebView has. */
final class WebFeatures {
    private WebFeatures() {}

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
