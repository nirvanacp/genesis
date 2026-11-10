package app.nirvana.genesis;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The cookies and site storage of one profile. Only the default profile, Android's shared
 * cookie jar and web storage, exists.
 */
public final class SiteData {
    /** The `cookieEnvelope` version of the compatibility table. */
    private static final int COOKIE_ENVELOPE = 1;
    private final CookieManager cookies;
    private final WebStorage storage;
    private final Handler main = new Handler(Looper.getMainLooper());

    private final SiteGrants grants;

    private SiteData(CookieManager cookies, WebStorage storage, SiteGrants grants) {
        this.cookies = cookies;
        this.storage = storage;
        this.grants = grants;
    }

    static SiteData defaultProfile(Context context) {
        return new SiteData(CookieManager.getInstance(), WebStorage.getInstance(), new SiteGrants(context, "default"));
    }

    /** What the user let this profile's websites use. */
    public SiteGrants grants() { return grants; }

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
     * Deletes the cookies, web storage and permission answers of these origins for every applet that uses them, then
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
            grants.clear(origin);
        }
        cookies.flush();
        main.post(done);
    }

    /**
     * Sets the cookies of a `genesis-applet dev cookies` import and returns how many it set. A
     * cookie whose domain has no leading dot stays host-only, so it gets no Domain attribute.
     */
    int importCookies(JSONObject payload) throws JSONException {
        if (payload.optInt("version") != COOKIE_ENVELOPE) throw new JSONException("Unsupported cookie import version " + payload.opt("version"));
        JSONArray list = payload.getJSONArray("cookies");
        SimpleDateFormat date = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss 'GMT'", Locale.US);
        date.setTimeZone(TimeZone.getTimeZone("GMT"));
        for (int i = 0; i < list.length(); i++) {
            JSONObject cookie = list.getJSONObject(i);
            String domain = cookie.getString("domain");
            StringBuilder header = new StringBuilder(cookie.getString("name")).append('=').append(cookie.getString("value"));
            if (domain.startsWith(".")) header.append("; Domain=").append(domain);
            header.append("; Path=").append(cookie.optString("path", "/"));
            long expires = cookie.optLong("expires", -1);
            if (expires > 0) header.append("; Expires=").append(date.format(new Date(expires * 1000)));
            if (cookie.optBoolean("secure")) header.append("; Secure");
            if (cookie.optBoolean("httpOnly")) header.append("; HttpOnly");
            String sameSite = cookie.optString("sameSite");
            if (!sameSite.isEmpty()) header.append("; SameSite=").append(sameSite);
            cookies.setCookie(cookie.getString("url"), header.toString());
        }
        cookies.flush();
        return list.length();
    }

    /** Clears every cookie, all site data and every permission answer, on any path, then runs `done` on the main thread. */
    public void clearAll(Runnable done) {
        storage.deleteAllData();
        grants.clearAll();
        cookies.removeAllCookies(removed -> {
            cookies.flush();
            main.post(done);
        });
    }
}
