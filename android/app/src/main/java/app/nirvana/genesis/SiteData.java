package app.nirvana.genesis;

import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The cookies, site storage and permission answers of one profile, in whichever website engine
 * keeps them. `WebViewSites` keeps them in Android WebView's profiles.
 */
public abstract class SiteData {
    /** The engine's profile name; each engine names its shared profile its own way. */
    final String profile;
    final SiteGrants grants;

    SiteData(String profile, SiteGrants grants) {
        this.profile = profile;
        this.grants = grants;
    }

    /** Whether this is the shared profile every applet uses unless it keeps its own. */
    abstract boolean isDefault();

    /** What the user let this profile's websites use. */
    public SiteGrants grants() { return grants; }

    /** The Cookie header for a request to `url`, or null; a download carries the page's sign-in with it. */
    abstract String cookies(String url);

    /** Whether the origin has any cookie at its root, which Settings shows as signed in. */
    public abstract boolean hasCookies(String origin);

    /**
     * Deletes the cookies, web storage and permission answers of these origins for every applet
     * that uses them, then runs `done` on the main thread. `visitedUrls` are the pages visited on
     * those sites, for an engine that can only expire cookies path by path.
     */
    public abstract void signOut(List<String> origins, List<String> visitedUrls, Runnable done);

    /** Sets the cookies of a `genesis-applet dev cookies` import and returns how many it set. */
    abstract int importCookies(JSONObject payload) throws JSONException;

    /** Clears every cookie, all site data and every permission answer, then runs `done` on the main thread. */
    public abstract void clearAll(Runnable done);
}
