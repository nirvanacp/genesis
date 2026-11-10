package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

/**
 * Every website WebView, including ones not created by `Views.document`, is configured here, so
 * a view and the views it opens share settings and site data.
 */
final class WebsiteSettings {
    private WebsiteSettings() {}

    /** `context` is true for a website context and false for the applet's foreground. */
    @SuppressLint({"SetJavaScriptEnabled", "RequiresFeature"}) // Each compat call is behind WebFeatures.has.
    static void apply(WebView web, boolean context, SiteData site) {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        web.setBackgroundColor(Color.WHITE);
        // Websites follow the system: their own dark theme when they have one, darkened otherwise,
        // and the system font size. The foreground is the applet's own UI and follows its own CSS.
        if (context) {
            if (WebFeatures.has(WebViewFeature.ALGORITHMIC_DARKENING)) WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, true);
            textZoom(web);
        }
        // No X-Requested-With setting: current WebView no longer sends the header, and the
        // allow-list API is deprecated and restricted in androidx.webkit.
        site.acceptCookies(web, context);
    }

    /** The system font size changed while the view lives; the activity handles `fontScale` itself. */
    static void configurationChanged(WebView web, boolean context) {
        if (context) textZoom(web);
    }

    private static void textZoom(WebView web) {
        web.getSettings().setTextZoom(Math.round(web.getContext().getResources().getConfiguration().fontScale * 100));
    }
}
