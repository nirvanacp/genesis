package app.nirvana.genesis;

import android.net.Uri;

/**
 * What each website engine can do that the other can't, and how the shell notices that an applet
 * needs it. When a page runs into a feature its engine lacks, `Shell.featureNeeded` offers to move
 * the applet to the engine that has it.
 *
 * | Feature | WebView | GeckoView | Noticed by |
 * | --- | --- | --- | --- |
 * | Google sign-in | no: Google refuses embedded WebViews | yes | Google's refusal page commits |
 * | Client certificates | yes | yes (`onRequestCertificate`) | no alert needed |
 * | Sign-in import | yes | no: no cookie writes | a development cookie import |
 * | Separate sign-in | only with WebView multi-profile | yes | Applet info row |
 *
 * Not detectable, so not listed: full screen from a context page (GeckoView lets only the active
 * session go full screen; the page gets no error), protected media (both answer key-system
 * requests; a refusal shows only as the site's own error), passkeys (no engine callback) and
 * colour inputs (GeckoView draws no colour picker and Genesis offers none there, so a colour
 * input keeps its value; the page gets no error).
 */
final class EngineFeatures {
    private EngineFeatures() {}

    enum Feature {
        GOOGLE_SIGN_IN("google-sign-in", "Google sign-in", false, true),
        SIGN_IN_IMPORT("sign-in-import", "Sign-in import", true, false),
        SEPARATE_SIGN_IN("separate-sign-in", "A separate sign-in", false, true);

        /** The stable name in stored answers. */
        final String key;
        final String title;
        /** Whether the feature works in each engine; `SEPARATE_SIGN_IN` in WebView depends on the phone. */
        private final boolean webView, gecko;

        Feature(String key, String title, boolean webView, boolean gecko) {
            this.key = key;
            this.title = title;
            this.webView = webView;
            this.gecko = gecko;
        }

        boolean worksIn(String engine) {
            if (GeckoEngine.ID.equals(engine)) return gecko;
            return this == SEPARATE_SIGN_IN ? WebViewSites.profilesSupported() : webView;
        }
    }

    /** The engine that has a feature the given engine lacks, or null when it isn't lacking or neither has it. */
    static String switchTarget(Feature feature, String engine) {
        if (feature.worksIn(engine)) return null;
        String other = GeckoEngine.ID.equals(engine) ? WebViewSites.ENGINE : GeckoEngine.ID;
        return feature.worksIn(other) ? other : null;
    }

    /** Google's "This browser or app may not be secure" page, which it shows embedded WebViews. */
    static boolean googleRefused(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        if (!"accounts.google.com".equals(uri.getHost())) return false;
        String path = uri.getPath() == null ? "" : uri.getPath();
        return path.equals("/signin/rejected") || path.equals("/v3/signin/rejected");
    }
}
