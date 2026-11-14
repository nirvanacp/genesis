package app.nirvana.genesis;

import android.os.SystemClock;

/**
 * A hidden context never shows UI, opens a window, asks for a permission or hands anything to
 * another app. Only the website the user is looking at may: the revealed context, or the popup it
 * opened over itself. Opening a window and handing off need a tap. The one exception is a grant:
 * after a tap on the applet UI, the applet may let a hidden context use one feature once.
 */
final class SitePolicy {
    private SitePolicy() {}

    /**
     * How long after trusted input a gesture may still be that input's, in ms. Chromium keeps a
     * page's user activation for about 5 s, and the activation outlives a reveal.
     */
    static final long INPUT_ACTIVATION_MS = 5000;

    /** How long after a tap on the applet UI the applet may start one user action, in ms. */
    static final long USER_ACTION_MS = 3000;

    /** How long a hidden context's grant lasts unused, in ms. Mirrors `GRANT_MS` in the contracts. */
    static final long GRANT_MS = 5000;

    /** The features a grant names, as the contracts' `GrantKind` spells them. */
    static final String FULLSCREEN = "fullscreen", DOWNLOAD = "download", WINDOW = "window", HANDOFF = "handoff", LOCATION = "location";

    /**
     * Whether a gesture WebView reports is the user's. WebView reads the page's activation when the
     * page asks, so for a few seconds after the page agent's trusted input it may be that input's.
     */
    static boolean usersGesture(Views.Page page, boolean gesture) {
        return gesture && (page.trustedInputAt == 0 || SystemClock.uptimeMillis() - page.trustedInputAt >= INPUT_ACTIVATION_MS);
    }

    /**
     * The same, except that a live grant of `kind` counts the gesture as the user's right after
     * trusted input: the user tapped the applet to allow exactly this. It is the one exception to
     * `INPUT_ACTIVATION_MS`, for one window or one hand-off.
     */
    static boolean usersGesture(Views.Page page, boolean gesture, String kind) {
        return gesture && (granted(page, kind) || usersGesture(page, true));
    }

    /** File choosers, fullscreen video and any other UI a page asks the shell for. */
    static boolean mayShowUi(Views.Page page) {
        return (page.isContext() || page.opener != null) && page.isRevealed();
    }

    /** A hidden context holds a live grant of `kind`. */
    static boolean granted(Views.Page page, String kind) {
        return page.isContext() && kind.equals(page.grant) && SystemClock.uptimeMillis() < page.grantUntil;
    }

    /** The shown website may use `kind`; a hidden context only with a live grant of it, which the caller then uses up. */
    static boolean mayUse(Views.Page page, String kind) {
        return mayShowUi(page) || granted(page, kind);
    }

    /** Handing a URL to another app, such as a `mailto:` or `tel:` link. */
    static boolean mayHandOff(Views.Page page, boolean gesture) {
        return mayUse(page, HANDOFF) && gesture;
    }
}
