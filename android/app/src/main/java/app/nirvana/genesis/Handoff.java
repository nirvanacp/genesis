package app.nirvana.genesis;

import android.content.Intent;
import android.net.Uri;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Turns a tapped website link into an Intent another app may handle. An `intent:` link can only
 * reach an app's browsable activities: Genesis drops its component, selector and URI grants.
 */
final class Handoff {
    private static final List<String> SCHEMES = Arrays.asList("mailto", "tel", "sms", "smsto", "geo");
    private static final int GRANTS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION;

    private Handoff() {}

    /** A safe Intent for the link, or null for schemes Genesis never hands off (file:, content:, javascript:, data:). */
    static Intent intent(String url) {
        String scheme = Uri.parse(url).getScheme();
        if (scheme == null) return null;
        scheme = scheme.toLowerCase(Locale.ROOT);
        if (SCHEMES.contains(scheme) || "http".equals(scheme) || "https".equals(scheme)) {
            return new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE);
        }
        if (!"intent".equals(scheme)) return null;
        try {
            Intent intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
            intent.setComponent(null);
            intent.setSelector(null);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.removeFlags(GRANTS);
            return intent;
        } catch (URISyntaxException error) {
            return null;
        }
    }

    /** The `browser_fallback_url` of an `intent:` link when it is a web address, else null. */
    static String fallback(String url) {
        if (!url.regionMatches(true, 0, "intent:", 0, 7)) return null;
        try {
            String fallback = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
            String scheme = fallback == null ? null : Uri.parse(fallback).getScheme();
            return "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme) ? fallback : null;
        } catch (URISyntaxException error) {
            return null;
        }
    }
}
