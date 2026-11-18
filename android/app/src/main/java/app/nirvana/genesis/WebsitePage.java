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
