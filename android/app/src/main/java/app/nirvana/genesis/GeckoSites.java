package app.nirvana.genesis;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.StorageController;

/**
 * A GeckoView profile's site data: Gecko's default cookie jar, shared by every applet that runs in
 * GeckoView, or a session context (`contextId`) an applet keeps for itself. GeckoView keeps its own
 * jars, apart from WebView's, so an applet that changes engine signs in again.
 */
final class GeckoSites extends SiteData {
    /** The shared profile's name; a separate sign-in uses the profile name Genesis stores for the applet. */
    private static final String DEFAULT = "gecko";
    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());

    private GeckoSites(Context context, String profile, SiteGrants grants) {
        super(profile, grants);
        this.context = context.getApplicationContext();
    }

    /** The jar every GeckoView applet shares. Its permission answers are its own, apart from WebView's. */
    static GeckoSites defaultProfile(Context context) {
        return new GeckoSites(context, DEFAULT, new SiteGrants(context, DEFAULT));
    }

    /** An applet's own jar, a session context named like its WebView profile would be. */
    static GeckoSites profile(Context context, String name) {
        return new GeckoSites(context, name, new SiteGrants(context, GeckoEngine.ID + ":" + name));
    }

    /** Deletes a separate sign-in's jar and permission answers. GeckoView can do so while pages use it. */
    static boolean delete(Context context, String name) {
        GeckoEngine.runtime(context).getStorageController().clearDataForSessionContext(name);
        new SiteGrants(context, GeckoEngine.ID + ":" + name).clearAll();
        return true;
    }

    @Override boolean isDefault() { return DEFAULT.equals(profile); }

    /** The session context a page in this profile opens with; null for the shared jar. */
    String contextId() { return isDefault() ? null : profile; }

    /** GeckoView reads no cookies outside a page; a download reaches the shell with its body instead. */
    @Override String cookies(String url) { return null; }

    /** GeckoView reads no cookies outside a page, so Settings cannot tell. */
    @Override public boolean hasCookies(String origin) { return false; }

    @Override public boolean readsCookies() { return false; }

    /**
     * GeckoView clears by host and by site (base domain), across every jar, which is coarser than
     * WebView's per-origin clearing; signing out of a site signs every GeckoView applet out of it.
     */
    @Override public void signOut(List<String> origins, List<String> visitedUrls, Runnable done) {
        StorageController storage = GeckoEngine.runtime(context).getStorageController();
        GeckoResult<Void> all = GeckoResult.fromValue(null);
        for (String origin : origins) {
            String host = Uri.parse(origin).getHost();
            if (host == null) continue;
            all = all.then(ignored -> storage.clearDataFromHost(host, StorageController.ClearFlags.SITE_DATA))
                .then(ignored -> storage.clearDataFromBaseDomain(host, StorageController.ClearFlags.SITE_DATA));
            grants.clear(origin);
        }
        all.accept(ignored -> main.post(done), error -> main.post(done));
    }

    /** Development cookie imports write through WebView's API, which GeckoView has no counterpart for. */
    @Override int importCookies(JSONObject payload) throws JSONException {
        throw new JSONException("Cookie imports need the applet to run in Android WebView");
    }

    @Override public void clearAll(Runnable done) {
        grants.clearAll();
        StorageController storage = GeckoEngine.runtime(context).getStorageController();
        if (!isDefault()) {
            storage.clearDataForSessionContext(profile);
            main.post(done);
            return;
        }
        storage.clearData(StorageController.ClearFlags.SITE_DATA).accept(ignored -> main.post(done), error -> main.post(done));
    }
}
