package app.nirvana.genesis;

import android.os.SystemClock;

/**
 * A hidden context never shows UI, opens a window, asks for a permission or hands anything to
 * another app. Only the website the user is looking at may: the revealed context, or the popup it
 * opened over itself. Opening a window and handing off need a tap.
 */
final class SitePolicy {
    private SitePolicy() {}

    /**
     * How long after trusted input a gesture may still be that input's, in ms. Chromium keeps a
     * page's user activation for about 5 s, and the activation outlives a reveal.
     */
    static final long INPUT_ACTIVATION_MS = 5000;

    /**
     * Whether a gesture WebView reports is the user's. WebView reads the page's activation when the
     * page asks, so for a few seconds after the page agent's trusted input it may be that input's.
     */
    static boolean usersGesture(Views.Page page, boolean gesture) {
        return gesture && (page.trustedInputAt == 0 || SystemClock.uptimeMillis() - page.trustedInputAt >= INPUT_ACTIVATION_MS);
    }

    /** File choosers, fullscreen video and any other UI a page asks the shell for. */
    static boolean mayShowUi(Views.Page page) {
        return (page.isContext() || page.opener != null) && page.isRevealed();
    }

    /** Handing a URL to another app, such as a `mailto:` or `tel:` link. */
    static boolean mayHandOff(Views.Page page, boolean gesture) {
        return mayShowUi(page) && gesture;
    }
}
