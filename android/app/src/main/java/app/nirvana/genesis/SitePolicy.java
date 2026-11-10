package app.nirvana.genesis;

/**
 * A hidden context never shows UI, opens a window, asks for a permission or hands anything to
 * another app. Only the website the user is looking at may, and hand-offs need a tap.
 */
final class SitePolicy {
    private SitePolicy() {}

    /** File choosers, fullscreen video and any other UI a page asks the shell for. */
    static boolean mayShowUi(Views.Page page) {
        return page.isContext() && page.isRevealed();
    }

    /** Handing a URL to another app, such as a `mailto:` or `tel:` link. */
    static boolean mayHandOff(Views.Page page, boolean gesture) {
        return mayShowUi(page) && gesture;
    }
}
