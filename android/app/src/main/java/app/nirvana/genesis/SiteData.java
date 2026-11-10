package app.nirvana.genesis;

import android.webkit.CookieManager;
import android.webkit.WebView;

/**
 * The cookies and site storage of one profile. Only the default profile, Android's shared
 * cookie jar and web storage, exists.
 */
public final class SiteData {
    private final CookieManager cookies;

    private SiteData(CookieManager cookies) {
        this.cookies = cookies;
    }

    static SiteData defaultProfile() {
        return new SiteData(CookieManager.getInstance());
    }

    /** Accepts cookies, and third-party cookies only in a website context. */
    void acceptCookies(WebView web, boolean thirdParty) {
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, thirdParty);
    }
}
