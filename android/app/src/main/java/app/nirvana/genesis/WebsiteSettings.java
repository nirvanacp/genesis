package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.webkit.WebSettings;
import android.webkit.WebView;

/**
 * Every website WebView, including ones not created by `Views.document`, is configured here, so
 * a view and the views it opens share settings and site data.
 */
final class WebsiteSettings {
    private WebsiteSettings() {}

    /** `context` is true for a website context and false for the applet's foreground. */
    @SuppressLint("SetJavaScriptEnabled")
    static void apply(WebView web, boolean context, SiteData site) {
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        web.setBackgroundColor(Color.WHITE);
        site.acceptCookies(web, context);
    }
}
