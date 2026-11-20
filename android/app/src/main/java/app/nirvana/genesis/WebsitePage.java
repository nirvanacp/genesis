package app.nirvana.genesis;

import android.view.View;
import java.util.List;
import org.json.JSONArray;

/**
 * One website document view, a context or a popup, in whichever engine runs it. The shell drives
 * every engine through this interface and hears back through `Views.Listener`.
 */
interface WebsitePage {
    /** The view the shell places in the hidden contexts, the revealed container or the popup sheet. */
    View view();

    /** Writes the console messages counted since the last line to the applet's debug log, if any. */
    default void logConsoleCounts() {}

    /** The committed URL, or null before the first commit. */
    String url();

    void load(String url);

    /** Swaps the current history entry for `url`, falling back to a load when the page can't. */
    void replace(String url);

    /**
     * Offers `url` to the page as a click on its own link, so a single-page website routes inside
     * the document. Loads the URL itself when the page has no such link, does not take the click,
     * or takes it and starts no navigation within a second.
     */
    void followLink(String url);

    /**
     * Like `followLink` for a push, or `replace`, but before loading asks the page's router to show
     * a same-origin URL inside the current document: the URL becomes the current entry (pushed or
     * replaced) and the page hears `popstate`, as on Back. When the page's elements and title do
     * not change within `ROUTE_WINDOW_MS`, the page loads the URL over that entry, so history
     * holds one entry for it either way. Only applet-driven navigation uses this, never a tap on
     * the revealed website.
     */
    void route(String url, boolean replace);

    /** How long the page has to change after the `popstate` of `route` before the URL loads. */
    long ROUTE_WINDOW_MS = 1000;

    /**
     * The page's half of `route`, shared by both engines: `(url, replace, windowMs)` answers false
     * when it did not change the history entry (another origin, the same path and query, a page
     * without a body, or an error), and the caller loads the URL instead.
     */
    String ROUTE = """
        (function (target, replace, windowMs) {
          try {
            var url = new URL(target);
            var here = new URL(location.href);
            if (url.origin !== here.origin || !document.body) return false;
            // The same path and query is a reload or a fragment move, which a load already does in place.
            if (url.pathname === here.pathname && url.search === here.search) return false;
            var title = document.title;
            var changed = false;
            var hasElement = function (nodes) {
              for (var i = 0; i < nodes.length; i++) if (nodes[i].nodeType === 1) return true;
              return false;
            };
            var observer = new MutationObserver(function (records) {
              for (var i = 0; i < records.length; i++) {
                if (hasElement(records[i].addedNodes) || hasElement(records[i].removedNodes)) changed = true;
              }
            });
            var state = history.state;
            var popstate = new PopStateEvent("popstate", { state: state });
            // Observed from before the entry changes: a website that routes on pushState itself counts too.
            observer.observe(document.documentElement, { childList: true, subtree: true });
            try {
              if (replace) history.replaceState(state, "", url.href);
              else history.pushState(state, "", url.href);
            } catch (error) {
              observer.disconnect();
              return false;
            }
            setTimeout(function () {
              observer.disconnect();
              if (changed || document.title !== title) return;
              // The router ignored it. A later navigation that moved on is left alone.
              if (location.href === url.href) location.replace(url.href);
            }, windowMs);
            dispatchEvent(popstate);
            return true;
          } catch (error) {
            return false;
          }
        })""";

    /**
     * Moves `delta` entries through the page's history. `unmoved` runs when nothing moved within
     * a second and the engine cannot move either.
     */
    void go(int delta, Runnable unmoved);

    void reload();

    /** The page's session history, oldest first. */
    History history();

    /** Whether the engine's own Back can move, for a popup the host does not track. */
    boolean canGoBack();

    void goBack();

    /** Sends a message to the page agent over the bridge; dropped when no agent is listening. */
    void post(String message);

    /**
     * The current document's bridge connection, or null when no agent can listen. A new document
     * gets a new one, so a transfer meant for the old document can tell it is gone.
     */
    Object channel();

    /** Whether `postBytes` reaches the agent; otherwise bytes go as base64 text messages. */
    boolean postsBytes();

    /** Sends an ArrayBuffer to the page agent; only when `postsBytes()`. */
    void postBytes(byte[] bytes);

    /** The user agent the page's requests carry, for a download the shell fetches itself. */
    String userAgent();

    /** Real input for a hidden page, as the page agent asked. */
    void input(JSONArray events) throws Input.Refused;

    /** The shell shows the page to the user (true) or hides it again (false). */
    void setRevealed(boolean revealed);

    /**
     * How much a covered page runs: `awake` draws and runs at full speed, `running` runs scripts,
     * network and media without drawing, `resting` also pauses the page as a background tab is.
     */
    void setActivity(String level);

    /** A covered page skips image downloads (true) or loads them again (false). */
    void setLight(boolean on);

    /** The system font size or appearance changed while the page lives. */
    void configurationChanged();

    void destroy();

    record History(int index, int size, List<String> urls) {}
}
