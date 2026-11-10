package app.nirvana.genesis;

import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The cookies and site storage of one profile. Only the default profile, Android's shared
 * cookie jar and web storage, exists.
 */
public final class SiteData {
    private final CookieManager cookies;
    private final WebStorage storage;
    private final Handler main = new Handler(Looper.getMainLooper());

    private SiteData(CookieManager cookies, WebStorage storage) {
        this.cookies = cookies;
        this.storage = storage;
    }

    static SiteData defaultProfile() {
        return new SiteData(CookieManager.getInstance(), WebStorage.getInstance());
    }

    /** Accepts cookies, and third-party cookies only in a website context. */
    void acceptCookies(WebView web, boolean thirdParty) {
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, thirdParty);
    }

    /** Whether the origin has any cookie at its root, which Settings shows as signed in. */
    public boolean hasCookies(String origin) {
        try {
            String cookie = cookies.getCookie(origin);
            return cookie != null && !cookie.trim().isEmpty();
        } catch (RuntimeException error) {
            return false;
        }
    }

    /**
     * Deletes the cookies and web storage of these origins for every applet that uses them, then
     * runs `done` on the main thread. One site's cookies can't be listed with their paths, so each
     * one is expired at the root and at every path in `visitedUrls` on that site.
     */
    public void signOut(List<String> origins, List<String> visitedUrls, Runnable done) {
        for (String origin : origins) {
            String host = Uri.parse(origin).getHost();
            if (host == null) continue;
            Set<String> paths = new LinkedHashSet<>();
            paths.add("/");
            for (String url : visitedUrls) {
                Uri uri = url == null ? null : Uri.parse(url);
                if (uri == null || !host.equals(uri.getHost())) continue;
                String prefix = "";
                for (String segment : uri.getPathSegments()) {
                    prefix += "/" + segment;
                    paths.add(prefix);
                }
            }
            List<String> domains = new ArrayList<>(List.of(host));
            if (host.indexOf('.') != host.lastIndexOf('.')) domains.add(host.substring(host.indexOf('.')));
            for (String path : paths) {
                String cookie = cookies.getCookie(origin + (path.equals("/") ? "" : path));
                if (cookie == null) continue;
                for (String pair : cookie.split(";")) {
                    String name = pair.split("=", 2)[0].trim();
                    if (name.isEmpty()) continue;
                    cookies.setCookie(origin, name + "=; Max-Age=0; Path=" + path);
                    for (String domain : domains) cookies.setCookie(origin, name + "=; Max-Age=0; Path=" + path + "; Domain=" + domain);
                }
            }
            storage.deleteOrigin(origin);
        }
        cookies.flush();
        main.post(done);
    }

    /** Clears every cookie and all site data, on any path, then runs `done` on the main thread. */
    public void clearAll(Runnable done) {
        storage.deleteAllData();
        cookies.removeAllCookies(removed -> {
            cookies.flush();
            main.post(done);
        });
    }
}
