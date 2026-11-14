package app.nirvana.genesis;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.ValueCallback;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import app.nirvana.genesis.ui.AddFlow;
import app.nirvana.genesis.ui.Connections;
import app.nirvana.genesis.ui.CreateApplet;
import app.nirvana.genesis.ui.GenesisMenu;
import app.nirvana.genesis.ui.Home;
import app.nirvana.genesis.ui.Manage;
import app.nirvana.genesis.ui.Notices;
import app.nirvana.genesis.ui.Review;
import app.nirvana.genesis.ui.Settings;
import app.nirvana.genesis.ui.Splash;
import app.nirvana.genesis.ui.Tokens;
import app.nirvana.genesis.ui.Ui;
import app.nirvana.genesis.ui.WebsiteBar;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One window's view tree. The manager window (`window` null) shows Home and the Genesis pages;
 * an applet window shows the applet container (hidden contexts, foreground, splash, the revealed
 * context with its website bar, Genesis button) and the Genesis pages above both. It executes
 * commands and reports user input; it holds no applet policy.
 */
final class Shell implements Views.Listener, Ui.Actions {
    /** The activity services the shell needs. */
    interface Owner {
        void send(JSONObject event);
        void launcherShown();
        boolean chooseFiles(Requests.FileRequest request, java.util.function.BooleanSupplier valid);
        void cancelInvalidFiles();
        /** Opens the system picker for the applet UI's `files.pick`; `callback` gets null when nothing usable was picked. */
        void chooseAppletFiles(String[] accept, boolean multiple, ValueCallback<Uri[]> callback, java.util.function.BooleanSupplier valid);
        /** The applet's "Hide in recent apps" choice changed; its window applies it. */
        void privacyChanged(String appletId);
        /** Opens the system picker for a bundle file, with its release record if the user picks one. */
        void pickAppletFile();
        Connections.Store connections();
        void storageSize(java.util.function.LongConsumer result);
        /**
         * Asks Android for these permissions, skipping those already held, and reports the granted
         * ones on the main thread, or null when the request was interrupted before the user answered.
         */
        void requestPermissions(String[] permissions, java.util.function.Consumer<Set<String>> granted);
    }

    private final Activity activity;
    private final Owner owner;
    /** The applet this window belongs to, or null for the manager. */
    private final String window;
    /** The shared sign-in, and the profiles of applets that keep their own, by applet id. */
    private final SiteData sites;
    private final Map<String, SiteData> profiles = new HashMap<>();
    private final android.content.SharedPreferences state;
    private final Views views;
    private Tokens tokens;
    private final FrameLayout root;
    private final FrameLayout applet, sources, foreground;
    private final Splash splash;
    private final Views.Revealed revealed;
    /** Shows the revealed context's popup in place of the context, which keeps running behind it. */
    private final Views.PopupSheet popupSheet;
    private final WebsiteBar bar;
    private final View menu, barrier;
    private final Ui ui;
    private final Home home;
    private final AddFlow addFlow;
    private final Review review;
    private final Manage manage;
    private final Connections connections;
    private final Notices notices;
    private final Settings settings;
    private final Map<String, Views.Page> pages = new HashMap<>();
    /** The applet UI's user actions, the tap that allows them, and its picked files. */
    private final UserActions actions;
    /** Hidden pages' open JavaScript dialogs by token, until answered or closed. */
    private final Map<Long, PendingDialog> dialogs = new HashMap<>();
    /** The website downloads of this window. */
    private final Downloads downloads;
    private static long nextDialog;
    private Views.Page revealedPage;
    /** The one window the revealed context opened, or null. */
    private Views.Page popup;
    /** The website question being asked, or null. */
    private Asking asking;
    /** Dismisses the open website sign-in prompt and cancels it, or null. */
    private Runnable cancelAuth;
    private String appletId, appletName;
    /** The user chose View website, so the next revealed context is their choice, not the applet's. */
    private boolean websiteChosen;
    private Requests.FullScreen customView;
    private int visualState;
    /** The host's progress message for flows that have no page of their own. */
    private androidx.appcompat.app.AlertDialog progress;
    private TextView progressText;

    Shell(Activity activity, Owner owner, String window) {
        this.activity = activity;
        this.owner = owner;
        this.window = window;
        sites = WebViewSites.defaultProfile(activity);
        state = state(activity);
        views = new Views(activity, this);
        actions = new UserActions(activity, this, owner);
        downloads = new Downloads(activity, this);
        tokens = new Tokens(activity);
        ui = new Ui(activity, tokens, this);
        addFlow = new AddFlow(ui);
        connections = new Connections(ui);
        manage = new Manage(ui, addFlow, connections);
        notices = new Notices(ui, addFlow);
        settings = new Settings(ui, manage::updates);
        review = new Review(ui, addFlow::finish);
        home = new Home(ui, new Home.Navigator() {
            @Override public void settings() { settings.open(); }
            @Override public void updates() { manage.updates(); }
            @Override public void info(String id) { manage.info(id); }
            @Override public void addFromRepository() { addFlow.open(null, null); }
            @Override public void control() { ui.pages.push("control", () -> Settings.control(ui), null, false); }
            @Override public void remove(String id) { manage.remove(id); }
        });

        root = new FrameLayout(activity);
        root.setBackgroundColor(tokens.surface);
        applyInsets(root);

        home.root.setVisibility(View.GONE);
        root.addView(home.root, new FrameLayout.LayoutParams(-1, -1));

        applet = new FrameLayout(activity);
        sources = new FrameLayout(activity) {
            @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) { return true; }
        };
        sources.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        applet.addView(sources, new FrameLayout.LayoutParams(-1, -1));
        barrier = new View(activity);
        barrier.setBackgroundColor(tokens.surface);
        barrier.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        applet.addView(barrier, new FrameLayout.LayoutParams(-1, -1));
        // A finger lifted on the applet UI allows one user action. The website bar, the revealed
        // website and its popups sit above this container and keep their touches.
        foreground = new FrameLayout(activity) {
            @Override public boolean dispatchTouchEvent(android.view.MotionEvent event) {
                if (event.getActionMasked() == android.view.MotionEvent.ACTION_UP) actions.tapped();
                return super.dispatchTouchEvent(event);
            }
        };
        applet.addView(foreground, new FrameLayout.LayoutParams(-1, -1));
        splash = new Splash(activity, tokens);
        applet.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        // A revealed context sits below the website bar, which grows with the font size; the Genesis button stays on top of both.
        LinearLayout website = new LinearLayout(activity);
        website.setOrientation(LinearLayout.VERTICAL);
        bar = new WebsiteBar(activity, tokens, () -> { if (!closePopup()) owner.send(GenesisRuntime.windowEvent("websiteDone", window)); });
        bar.setOnUpdate(manage::updates);
        bar.setVisibility(View.GONE);
        website.addView(bar, new LinearLayout.LayoutParams(-1, -2));
        revealed = new Views.Revealed(activity);
        revealed.setBackgroundColor(tokens.surface);
        revealed.setVisibility(View.GONE);
        website.addView(revealed, new LinearLayout.LayoutParams(-1, 0, 1));
        popupSheet = new Views.PopupSheet(activity);
        popupSheet.setBackgroundColor(tokens.surface);
        popupSheet.setVisibility(View.GONE);
        website.addView(popupSheet, new LinearLayout.LayoutParams(-1, 0, 1));
        applet.addView(website, new FrameLayout.LayoutParams(-1, -1));
        menu = GenesisMenu.button(tokens, this::openMenu);
        applet.addView(menu, menuLayout());
        // An applet window shows its container from the start, under the splash, until the applet starts.
        applet.setVisibility(window == null ? View.GONE : View.VISIBLE);
        root.addView(applet, new FrameLayout.LayoutParams(-1, -1));
        root.addView(ui.root(), new FrameLayout.LayoutParams(-1, -1));

        activity.setContentView(root);
        tokens.applySystemBars(activity);
    }

    /** Replaces the content with S27; used when the WebView lacks required features. */
    static void unsupported(Activity activity) {
        Tokens tokens = new Tokens(activity);
        Ui ui = new Ui(activity, tokens, null);
        FrameLayout root = new FrameLayout(activity);
        root.setBackgroundColor(tokens.surface);
        applyInsets(root);
        root.addView(Notices.webViewTooOld(ui, WebFeatures.providerVersion(activity)), new FrameLayout.LayoutParams(-1, -1));
        activity.setContentView(root);
        tokens.applySystemBars(activity);
    }

    /** The applet this window belongs to, or null for the manager. */
    String window() { return window; }

    Activity activity() { return activity; }

    // -----------------------------------------------------------------------------------------
    // Commands

    void showLauncher(JSONArray applets, long updatesCheckedAt) {
        destroyAll();
        deleteProfiles();
        ui.applets = applets;
        ui.updatesCheckedAt = updatesCheckedAt;
        appletId = null;
        applet.setVisibility(View.GONE);
        home.root.setVisibility(View.VISIBLE);
        home.render();
        ui.pages.refresh();
        owner.launcherShown();
    }

    /** New launcher entries while an applet is open: the menu and open pages read them. */
    void updateApplets(JSONArray applets, long updatesCheckedAt) {
        ui.applets = applets;
        ui.updatesCheckedAt = updatesCheckedAt;
        ui.pages.refresh();
    }

    /** Every URL the open applet's pages have visited, for clearing cookies set on deeper paths. */
    @Override public List<String> visitedUrls() {
        List<String> urls = new ArrayList<>();
        for (Views.Page page : pages.values()) {
            urls.addAll(page.tab.history().urls());
        }
        return urls;
    }

    void showApplet(String id, String name, String accent, String icon) {
        destroyAll();
        ui.pages.clear();
        appletId = id;
        appletName = name;
        home.root.setVisibility(View.GONE);
        applet.setVisibility(View.VISIBLE);
        splash.show(name, accent, icon);
        if (activity instanceof AppletActivity) ((AppletActivity) activity).describeTask(name, accent, icon);
        askWaitingFeature();
    }

    void createView(JSONObject ref, String url, JSONArray origins, String startScript) throws JSONException {
        destroyView(ref);
        // The foreground is Genesis's own page and keeps the shared profile; only websites change sign-in.
        SiteData site = "foreground".equals(ref.optString("role")) ? sites : sitesFor(ref.optString("appletId"));
        Views.Page page = views.document(ref, set(origins), startScript, site);
        pages.put(key(ref), page);
        if (page.isForeground()) {
            page.tab.view().setVisibility(View.INVISIBLE);
            foreground.addView(page.tab.view(), new FrameLayout.LayoutParams(-1, -1));
        } else {
            sources.addView(page.tab.view(), new FrameLayout.LayoutParams(-1, -1));
        }
        page.tab.load(url);
    }

    void destroyView(JSONObject ref) {
        Views.Page page = pages.remove(key(ref));
        if (page == null) return;
        closeDialogs(page);
        endGrant(page, false);
        downloads.drop(page);
        if (page == revealedPage) dropRevealed();
        else if (popup != null && popup.opener == page) closePopup();
        if (page.isForeground()) actions.clear();
        page.destroy();
    }

    /**
     * `push` first lets the page follow its own link to the URL, and loads the URL when the page
     * shows no such link or does not take the click. `replace` swaps the current history entry
     * through the page, falling back to a push when it cannot run script.
     */
    void loadUrl(JSONObject ref, String url, String mode) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        if ("replace".equals(mode)) page.tab.replace(url);
        else page.tab.followLink(url);
    }

    /**
     * Moves through the context's history in the page. When neither the page nor the engine can
     * move, the host hears `historyUnmoved` so a Back can fall through.
     */
    void historyGo(JSONObject ref, int delta) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        page.tab.go(delta, () -> {
            try { owner.send(Bridge.event("historyUnmoved").put("view", page.ref)); }
            catch (JSONException ignored) { /* Unreachable for these values. */ }
        });
    }

    void reload(JSONObject ref) {
        Views.Page page = pages.get(key(ref));
        if (page != null) page.tab.reload();
    }

    /** Reparents the context's WebView above the foreground. Nothing reloads; the page keeps running. */
    void revealContext(JSONObject ref, String title) {
        Views.Page page = pages.get(key(ref));
        if (page == null || !page.isContext()) return;
        endGrants();
        // A window a hidden context opened with its grant shows over the applet, not over a website.
        if (popup != null && popup.opener != revealedPage) closePopup();
        if (revealedPage != null && revealedPage != page) coverContext();
        if (revealedPage == page) { bar.setTitle(title); return; }
        View view = page.tab.view();
        sources.removeView(view);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        revealed.addView(view, new FrameLayout.LayoutParams(-1, -1));
        revealed.setVisibility(View.VISIBLE);
        page.tab.setRevealed(true);
        bar.setTitle(title);
        bar.setUrl(page.tab.url());
        JSONObject entry = appletId == null ? null : ui.entry(appletId);
        bar.setReason(appletName, websiteChosen, entry != null && Home.hasUpdate(entry));
        websiteChosen = false;
        bar.setVisibility(View.VISIBLE);
        GenesisMenu.tint(menu, tokens, true);
        revealedPage = page;
    }

    /**
     * Returns the revealed WebView to the hidden contexts. The page a screen reader was reading
     * disappears, so its focus moves to the menu button instead of falling to an arbitrary view.
     */
    @SuppressLint("AccessibilityFocus")
    void coverContext() {
        endGrants();
        Views.Page page = revealedPage;
        if (page == null) return;
        closeCustomView();
        cancelPrompts();
        dropRevealed();
        stopCapture(page);
        View view = page.tab.view();
        view.clearFocus();
        view.setFocusable(false);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        sources.addView(view, new FrameLayout.LayoutParams(-1, -1));
        page.tab.setRevealed(false);
        owner.cancelInvalidFiles();
        menu.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null);
    }

    /**
     * A page the user stops seeing may not keep the camera or microphone they allowed while looking
     * at it. WebView has no call that ends a page's capture, so the page reloads.
     */
    private static void stopCapture(Views.Page page) {
        if (!page.capturing) return;
        page.capturing = false;
        page.tab.reload();
    }

    /** Hides the revealed container and forgets its page, leaving the WebView detached. */
    private void dropRevealed() {
        closePopup();
        if (revealedPage != null) revealed.removeView(revealedPage.tab.view());
        revealedPage = null;
        revealed.setVisibility(View.GONE);
        bar.setVisibility(View.GONE);
        GenesisMenu.tint(menu, tokens, false);
    }

    void postMessage(JSONObject ref, String payload) {
        Views.Page page = pages.get(key(ref));
        if (page != null) page.post(payload);
    }

    /**
     * Dispatches the page agent's trusted input to a hidden context, then reports `inputDone`.
     * A revealed context gets none, since input there would count as the user's own gesture.
     */
    void input(JSONObject ref, long token, JSONArray events) {
        Views.Page page = pages.get(key(ref));
        String refusal = null;
        if (page == null || !page.isContext()) refusal = "The page is gone";
        else if (page.isRevealed()) refusal = "Trusted input goes only to a hidden page";
        else {
            try {
                page.tab.input(events);
                page.trustedInputAt = SystemClock.uptimeMillis();
            }
            catch (Input.Refused refused) { refusal = refused.getMessage(); }
        }
        String message = refusal;
        // Answered after this command batch, since the host is still handling the event that sent it.
        bar.post(() -> {
            try {
                owner.send(Bridge.event("inputDone").put("view", ref).put("token", token)
                    .put("ok", message == null).put("message", message == null ? JSONObject.NULL : message));
            } catch (JSONException ignored) { /* Unreachable for these values. */ }
        });
    }

    /** Carries out a user action for the applet UI, after checking its tap. `view` is the context it concerns, or null. */
    void userAction(long token, JSONObject view, JSONObject action) {
        if (appletId == null) {
            JSONObject refusal = UserActions.done(token, "NOT_FOUND", "The applet is not open", null);
            bar.post(() -> owner.send(refusal));
            return;
        }
        actions.run(appletId, token, view, action);
    }

    @Override public void blobMessage(Views.Page page, String payload) { downloads.message(page, payload); }

    @Override public void blobBytes(Views.Page page, byte[] bytes) { downloads.bytes(page, bytes); }

    /**
     * Lets hidden context `view` use `kind` once within `GRANT_MS`, after the tap the caller used.
     * A new grant replaces an unused one. Returns the `userActionDone` answer.
     */
    JSONObject grant(long token, JSONObject view, String kind) {
        Views.Page page = view == null ? null : pages.get(key(view));
        if (page == null || !page.isContext()) return UserActions.done(token, "NOT_FOUND", "The website is gone", null);
        try {
            if (page.isRevealed()) return UserActions.done(token, null, null, new JSONObject().put("granted", true).put("expiresInMs", 0));
            endGrant(page, false);
            page.grant = kind;
            page.grantUntil = SystemClock.uptimeMillis() + SitePolicy.GRANT_MS;
            page.grantExpiry = () -> { if (page.grant != null) endGrant(page, false); };
            bar.postDelayed(page.grantExpiry, SitePolicy.GRANT_MS);
            return UserActions.done(token, null, null, new JSONObject().put("granted", true).put("expiresInMs", SitePolicy.GRANT_MS));
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    /** A page used its grant: it ends as used. A window grant leaves the page `GRANT_MS` to show the window the host may still ask for. */
    @Override public void useGrant(Views.Page page) {
        if (page.grant == null) return;
        if (SitePolicy.WINDOW.equals(page.grant)) page.windowUntil = SystemClock.uptimeMillis() + SitePolicy.GRANT_MS;
        endGrant(page, true);
    }

    /** Ends the page's grant, if any, and tells the host after the command batch under way. */
    private void endGrant(Views.Page page, boolean used) {
        String grant = page.grant;
        if (grant == null) return;
        page.grant = null;
        page.grantUntil = 0;
        if (page.grantExpiry != null) bar.removeCallbacks(page.grantExpiry);
        page.grantExpiry = null;
        bar.post(() -> {
            try { owner.send(Bridge.event("grantEnded").put("view", page.ref).put("grant", grant).put("used", used)); }
            catch (JSONException ignored) { /* Unreachable for these values. */ }
        });
    }

    /** What the user sees changed, so no hidden page keeps the grant their tap gave. */
    private void endGrants() {
        for (Views.Page page : pages.values()) endGrant(page, false);
    }

    /** Posts picked files to the page agent of `ref`'s page, for its `attachFiles`. */
    void sendFiles(JSONObject ref, long token, JSONArray files) { actions.send(pages.get(key(ref)), token, files); }

    /** The applet let go of these picked files. */
    void releaseFiles(JSONArray ids) { actions.release(ids); }

    @Override public android.webkit.WebResourceResponse pickedFile(String id) { return actions.preview(id); }

    /** A hidden page's JavaScript dialog: the page waits until `result` is answered. */
    private static final class PendingDialog {
        final Views.Page page;
        final String kind, message, defaultValue;
        final Requests.DialogResult result;
        /** Genesis's dialog that shows it over the applet UI. */
        android.app.Dialog shown;

        PendingDialog(Views.Page page, String kind, String message, String defaultValue, Requests.DialogResult result) {
            this.page = page;
            this.kind = kind;
            this.message = message;
            this.defaultValue = defaultValue;
            this.result = result;
        }

        /** OK, with a prompt's `value` (its default when null), or Cancel. */
        void answer(boolean accept, String value) {
            if (!accept) result.cancel();
            else if ("prompt".equals(kind)) result.confirm(value != null ? value : defaultValue != null ? defaultValue : "");
            else result.confirm(null);
        }
    }

    /** Shows dialog `token` over the applet UI, titled with the page's origin; the website stays hidden. */
    private void showDialog(long token, PendingDialog dialog) {
        android.widget.EditText field = null;
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(activity)
            .setTitle(Views.origin(String.valueOf(dialog.page.tab.url())))
            .setMessage(dialog.message);
        if ("prompt".equals(dialog.kind)) {
            LinearLayout form = new LinearLayout(activity);
            form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
            field = authField("", android.text.InputType.TYPE_CLASS_TEXT);
            if (dialog.defaultValue != null) field.setText(dialog.defaultValue);
            form.addView(field, new LinearLayout.LayoutParams(-1, -2));
            builder.setView(form);
        }
        android.widget.EditText input = field;
        builder.setPositiveButton("OK", (d, w) -> closeDialog(token, true, input == null ? null : input.getText().toString()));
        if (!"alert".equals(dialog.kind)) builder.setNegativeButton("Cancel", (d, w) -> closeDialog(token, false, null));
        builder.setOnCancelListener(d -> closeDialog(token, false, null));
        dialog.shown = builder.show();
    }

    /** Ends dialog `token` with the user's answer, or cancels it, and tells the host its calls' deadlines run again. */
    private void closeDialog(long token, boolean accept, String value) {
        PendingDialog dialog = dialogs.remove(token);
        if (dialog == null) return;
        if (dialog.shown != null) dialog.shown.dismiss();
        dialog.answer(accept, value);
        // Sent after the current command batch, since a destroyView that closes it runs inside one.
        bar.post(() -> {
            try { owner.send(Bridge.event("jsDialogClosed").put("view", dialog.page.ref).put("token", token)); }
            catch (JSONException ignored) { /* Unreachable for these values. */ }
        });
    }

    /** The page navigated or is going away: its open dialogs are cancelled. */
    private void closeDialogs(Views.Page page) {
        List<Long> open = new ArrayList<>();
        for (Map.Entry<Long, PendingDialog> entry : dialogs.entrySet()) if (entry.getValue().page == page) open.add(entry.getKey());
        for (long token : open) closeDialog(token, false, null);
    }

    /** Shows the foreground once its first frame with applet content is ready to draw. */
    void revealForeground() {
        Views.Page page = foregroundPage();
        if (page == null) return;
        // The foreground is always a WebView page.
        android.webkit.WebView web = ((WebViewPage) page.tab).web;
        web.postVisualStateCallback(++visualState, new android.webkit.WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                if (pages.get(key(page.ref)) != page) return;
                web.setVisibility(View.VISIBLE);
                splash.hide();
            }
        });
    }

    /** A running flow's message; null ends it. The add flow shows its own pages; others get a dialog. */
    void showProgress(String message) {
        if (addFlow.progress(message) && message != null) return;
        if (message == null) {
            if (progress != null) progress.dismiss();
            progress = null;
            progressText = null;
            return;
        }
        if (progress != null) { progressText.setText(message); return; }
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(tokens.dp(24), tokens.dp(20), tokens.dp(24), tokens.dp(8));
        com.google.android.material.progressindicator.CircularProgressIndicator spinner =
            new com.google.android.material.progressindicator.CircularProgressIndicator(activity);
        spinner.setIndeterminate(true);
        spinner.setIndicatorColor(tokens.primary);
        row.addView(spinner, new LinearLayout.LayoutParams(-2, -2));
        progressText = tokens.text(message, Tokens.Type.BODY_LARGE, tokens.onSurface);
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(0, -2, 1);
        textLayout.setMarginStart(tokens.dp(16));
        row.addView(progressText, textLayout);
        progress = new MaterialAlertDialogBuilder(activity).setView(row).setCancelable(false)
            .setNegativeButton("Cancel", (d, w) -> {
                progress = null;
                progressText = null;
                owner.send(Bridge.event("cancelFlow"));
            }).show();
    }

    void showRepositoryApplets(JSONObject command) {
        dismissProgress();
        addFlow.repositoryApplets(command);
    }

    void showImportReview(JSONObject command) {
        dismissProgress();
        review.show(command);
    }

    void showInstalled(JSONObject command) {
        dismissProgress();
        addFlow.finish();
        review.installed(command);
    }

    private void dismissProgress() {
        if (progress != null) progress.dismiss();
        progress = null;
        progressText = null;
    }

    void showError(String message) {
        dismissProgress();
        if (addFlow.error(message)) return;
        new MaterialAlertDialogBuilder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null)
            .setOnDismissListener(d -> leaveIfEmpty()).show();
    }

    /** An applet window whose applet did not start has nothing to show after its message: Genesis opens instead. */
    private void leaveIfEmpty() {
        if (window != null && appletId == null && ui.pages.top() == null) goHome();
    }

    /** "Go to Home" in an applet window opens the Genesis list; the manager already shows it. */
    @Override public void goHome() {
        if (window == null) return;
        try { activity.startActivity(new Intent(activity, MainActivity.class)); }
        catch (RuntimeException error) { activity.moveTaskToBack(true); }
    }

    /** Update checks from the Updates page answer with a short toast; anything else gets a dialog. */
    void showInfo(String title, String message) {
        if ("updates".equals(ui.pages.top())) {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
            return;
        }
        new MaterialAlertDialogBuilder(activity).setTitle(title).setMessage(message).setPositiveButton("Close", null).show();
    }

    /**
     * An applet that cannot open, an applet whose page stopped, or an import this Genesis cannot run.
     * `entry` is the applet's launcher entry; `details` is the host's text, used when the entry has no mismatches.
     */
    void showStatus(String kind, JSONObject entry, String details) {
        switch (kind) {
            case "rendererLost": notices.stopped(entry); break;
            case "importReceived": notices.imported(entry, details); break;
            default: notices.cantRun(entry, details); break;
        }
    }

    @Override public void openExternal(String url) {
        Intent intent = Handoff.intent(url);
        if (intent == null || !handOff(intent)) showError("No app can open " + url);
    }

    /**
     * Only the shown website downloads, since Android reports no tap for a download. The request
     * carries the site's cookies, so a signed-in file arrives instead of a sign-in page.
     */
    @Override public void download(Views.Page page, String url, String userAgent, String disposition, String mimeType) {
        if (!SitePolicy.mayUse(page, SitePolicy.DOWNLOAD)) return;
        useGrant(page);
        // A window that only started a download has nothing to show.
        if (page == popup && page.tab.history().size() == 0) bar.post(() -> { if (page == popup) closePopup(); });
        downloads.start(page, url, userAgent, disposition, mimeType);
    }

    /** Downloads `url` with the page's cookies through DownloadManager; false when it couldn't start. */
    boolean startDownload(Views.Page page, String url, String userAgent, String mimeType, String name) {
        return downloads.startDownload(page, url, userAgent, mimeType, name);
    }

    @Override public boolean handOff(Intent intent) {
        try {
            activity.startActivity(intent);
            return true;
        } catch (RuntimeException error) {
            // A page names the target: no app, or an activity that is not exported or needs a permission.
            return false;
        }
    }

    /**
     * System Back: a fullscreen video, then the top Genesis page, then the popup's own history and
     * the popup itself. Returns whether the shell used it. The host does not track popup history,
     * so the popup's native goBack is enough.
     */
    boolean back() {
        if (closeCustomView()) return true;
        if (ui.pages.back()) return true;
        if (popup == null) return false;
        if (popup.tab.canGoBack()) popup.tab.goBack();
        else closePopup();
        return true;
    }

    /** Removes the popup and shows its opener again. Returns whether one was open. */
    private boolean closePopup() {
        Views.Page page = popup;
        if (page == null) return false;
        popup = null;
        closeCustomView();
        cancelPrompts();
        popupSheet.removeView(page.tab.view());
        popupSheet.setVisibility(View.GONE);
        page.destroy();
        owner.cancelInvalidFiles();
        if (revealedPage != null) {
            revealed.setVisibility(View.VISIBLE);
            revealedPage.tab.setRevealed(true);
            bar.setUrl(revealedPage.tab.url());
        } else {
            bar.setVisibility(View.GONE);
            GenesisMenu.tint(menu, tokens, false);
        }
        return true;
    }

    /** Closes a fullscreen video. Returns whether one was showing, so Back stays local to the shell. */
    boolean closeCustomView() {
        if (customView == null) return false;
        Requests.FullScreen screen = customView;
        customView = null;
        root.removeView(screen.view);
        screen.exit();
        return true;
    }

    void destroy() {
        destroyAll();
    }

    private void destroyAll() {
        endGrants();
        downloads.destroy();
        closeCustomView();
        cancelPrompts();
        dropRevealed();
        owner.cancelInvalidFiles();
        actions.clear();
        for (Views.Page page : pages.values()) closeDialogs(page);
        for (Views.Page page : pages.values()) page.destroy();
        pages.clear();
    }

    // -----------------------------------------------------------------------------------------
    // View reports

    @Override public void documentStarted(Views.Page page, String url) {
        if (pages.get(key(page.ref)) != page) return;
        closeDialogs(page);
        endGrant(page, false);
        page.windowUntil = 0;
        try { owner.send(Bridge.event("documentStarted").put("view", page.ref).put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void documentMessage(Views.Page page, String payload) {
        if (pages.get(key(page.ref)) != page) return;
        try { owner.send(Bridge.event("documentMessage").put("view", page.ref).put("payload", payload)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void contextNavigated(Views.Page page, Views.Committed committed) {
        if (pages.get(key(page.ref)) != page) return;
        if (page == revealedPage) bar.setUrl(committed.url);
        try {
            owner.send(Bridge.event("contextNavigated").put("view", page.ref).put("url", committed.url)
                .put("index", committed.index).put("size", committed.size)
                .put("canGoBack", committed.canGoBack()).put("canGoForward", committed.canGoForward())
                .put("sameDocument", committed.sameDocument).put("reload", committed.reload));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /** The dead WebView goes now; the host decides what the applet shows. A popup only closes. */
    @Override public void rendererGone(Views.Page page) {
        if (page == popup) { closePopup(); return; }
        if (pages.get(key(page.ref)) != page) return;
        pages.remove(key(page.ref));
        closeDialogs(page);
        endGrant(page, false);
        downloads.drop(page);
        if (page == revealedPage) dropRevealed();
        else if (popup != null && popup.opener == page) closePopup();
        page.destroy();
        try { owner.send(Bridge.event("rendererGone").put("view", page.ref)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void showFullScreen(Requests.FullScreen screen) {
        closeCustomView();
        customView = screen;
        screen.view.setBackgroundColor(Color.BLACK);
        root.addView(screen.view, new FrameLayout.LayoutParams(-1, -1));
    }

    @Override public void hideFullScreen() {
        if (customView == null) return;
        root.removeView(customView.view);
        customView = null;
    }

    @Override public boolean chooseFiles(Views.Page page, Requests.FileRequest request) {
        return owner.chooseFiles(request, () -> (page == popup || pages.get(key(page.ref)) == page) && SitePolicy.mayShowUi(page));
    }

    /**
     * The opener keeps running behind the sheet, so `window.opener.postMessage` still reaches it,
     * but it is no longer shown: its prompts and fullscreen video close and its capture stops. A
     * hidden opener's sheet shows over the applet with the website bar, and Done or Back returns
     * to the applet.
     */
    @Override public Views.Page openWindow(Views.Page opener) {
        if (!mayOpenWindow(opener)) return null;
        opener.windowUntil = 0;
        endGrants();
        closePopup();
        closeCustomView();
        cancelPrompts();
        stopCapture(opener);
        popup = views.popup(opener);
        popupSheet.addView(popup.tab.view(), new FrameLayout.LayoutParams(-1, -1));
        popupSheet.setVisibility(View.VISIBLE);
        revealed.setVisibility(View.GONE);
        opener.tab.setRevealed(false);
        popup.tab.setRevealed(true);
        owner.cancelInvalidFiles();
        if (opener != revealedPage) {
            bar.setTitle(appletName);
            bar.setReason(appletName, true, false);
            bar.setVisibility(View.VISIBLE);
            GenesisMenu.tint(menu, tokens, true);
        }
        bar.setUrl(popup.tab.url());
        return popup;
    }

    /** The revealed context, or a hidden one that used its window grant in the last `GRANT_MS`. */
    private boolean mayOpenWindow(Views.Page opener) {
        return opener == revealedPage || (opener.isContext() && SystemClock.uptimeMillis() < opener.windowUntil);
    }

    /** A tapped link asks for a new window; the host decides where it goes. */
    @Override public void windowRequested(Views.Page page, String url) {
        if (!mayOpenWindow(page)) return;
        try { owner.send(Bridge.event("windowRequested").put("view", page.ref).put("url", url)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /**
     * No applet uses the link's website: it opens in a popup sheet over the context that asked,
     * in the same sign-in. A context the user has since left gets no sheet.
     */
    void showWindow(JSONObject ref, String url) {
        Views.Page page = pages.get(key(ref));
        if (page == null) return;
        Views.Page window = openWindow(page);
        if (window != null) window.tab.load(url);
    }

    /** `window.close()` arrives inside the popup's own callback, so the view goes after it returns. */
    @Override public void closeWindow(Views.Page page) {
        bar.post(() -> { if (page == popup) closePopup(); });
    }

    @Override public void popupNavigated(Views.Page page, String url) {
        if (page == popup) bar.setUrl(url);
    }

    /** One website question: the dialog, then Android's own request. Answers once. */
    private final class Asking {
        final java.util.function.Consumer<Set<String>> result;
        android.app.Dialog dialog;
        boolean done;

        Asking(java.util.function.Consumer<Set<String>> result) { this.result = result; }

        void finish(Set<String> allowed) {
            if (done) return;
            done = true;
            if (asking == this) asking = null;
            if (dialog != null) dialog.dismiss();
            result.accept(allowed);
        }
    }

    /**
     * Genesis asks once per site and remembers the answer in `SiteGrants`; Android then asks for
     * its own permission if Genesis doesn't hold it yet. A refusal at either step refuses the site.
     * The Genesis dialog names only the permissions the site has not been answered for, and its
     * answer leaves the earlier ones as they were.
     */
    @Override public void askSite(Views.Page page, String origin, List<String> permissions, java.util.function.Consumer<Set<String>> allowed) {
        cancelPrompts();
        SiteGrants grants = page.site.grants();
        // A blocked permission stays blocked; the site still gets the others it asked for.
        List<String> open = new ArrayList<>();
        List<String> fresh = new ArrayList<>();
        for (String permission : permissions) {
            Boolean grant = grants.get(origin, permission);
            if (Boolean.FALSE.equals(grant)) continue;
            open.add(permission);
            if (grant == null) fresh.add(permission);
        }
        if (open.isEmpty()) { allowed.accept(Set.of()); return; }
        Asking ask = new Asking(allowed);
        asking = ask;
        if (fresh.isEmpty()) { askAndroid(ask, grants, origin, open); return; }
        List<String> earlier = new ArrayList<>(open);
        earlier.removeAll(fresh);
        ask.dialog = new MaterialAlertDialogBuilder(activity)
            .setTitle(Ui.host(origin) + " wants to use your " + permissionNames(fresh))
            .setMessage("Only while you're looking at it. You can reset this in Settings, Sites & sign-ins.")
            .setPositiveButton("Allow", (d, w) -> {
                for (String permission : fresh) grants.set(origin, permission, true);
                askAndroid(ask, grants, origin, open);
            })
            .setNegativeButton("Don't allow", (d, w) -> {
                for (String permission : fresh) grants.set(origin, permission, false);
                if (earlier.isEmpty()) ask.finish(Set.of());
                else askAndroid(ask, grants, origin, earlier);
            })
            .setOnCancelListener(d -> ask.finish(Set.of()))
            .show();
    }

    /**
     * Android's own request. A permission Android refuses loses its Genesis grant too, so the
     * site asks in Genesis again instead of showing an allowed grant that has no effect. When
     * Android refuses for good, it no longer asks, so Genesis points to Android's settings. An
     * interrupted request refuses this time and keeps the grants. A question already cancelled,
     * because the user left the website, ignores Android's late answer.
     */
    private void askAndroid(Asking ask, SiteGrants grants, String origin, List<String> permissions) {
        List<String> android = new ArrayList<>();
        for (String permission : permissions) for (String name : androidPermissions(permission)) android.add(name);
        owner.requestPermissions(android.toArray(new String[0]), granted -> {
            if (ask.done) return;
            if (granted == null) { ask.finish(Set.of()); return; }
            Set<String> allowed = new LinkedHashSet<>();
            List<String> blocked = new ArrayList<>();
            for (String permission : permissions) {
                for (String name : androidPermissions(permission)) if (granted.contains(name)) { allowed.add(permission); break; }
                if (allowed.contains(permission)) continue;
                grants.forget(origin, permission);
                if (refusedForGood(permission)) blocked.add(permission);
            }
            ask.finish(allowed);
            if (!blocked.isEmpty()) showAndroidSettings(blocked);
        });
    }

    /** Android refuses without asking once the user denied a permission twice or chose "Don't ask again". */
    private boolean refusedForGood(String permission) {
        for (String name : androidPermissions(permission)) {
            if (activity.checkSelfPermission(name) == android.content.pm.PackageManager.PERMISSION_GRANTED) return false;
            if (activity.shouldShowRequestPermissionRationale(name)) return false;
        }
        return true;
    }

    private void showAndroidSettings(List<String> permissions) {
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Android blocks Genesis from using your " + permissionNames(permissions))
            .setMessage("Allow it for Genesis in Android's settings, under Permissions.")
            .setPositiveButton("Open settings", (d, w) -> activity.startActivity(
                new android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.fromParts("package", activity.getPackageName(), null))))
            .setNegativeButton("Not now", null)
            .show();
    }

    /** The Android permissions behind a `SiteGrants` permission; any one of them is enough. */
    private static String[] androidPermissions(String permission) {
        switch (permission) {
            case SiteGrants.CAMERA: return new String[] { android.Manifest.permission.CAMERA };
            case SiteGrants.MICROPHONE: return new String[] { android.Manifest.permission.RECORD_AUDIO };
            case SiteGrants.LOCATION: return new String[] { android.Manifest.permission.ACCESS_FINE_LOCATION, android.Manifest.permission.ACCESS_COARSE_LOCATION };
            default: return new String[0];
        }
    }

    private static String permissionNames(List<String> permissions) {
        if (permissions.contains(SiteGrants.CAMERA) && permissions.contains(SiteGrants.MICROPHONE)) return "camera and microphone";
        return permissions.isEmpty() ? "" : permissions.get(0);
    }

    @Override public void cancelAsk() {
        if (asking != null) asking.finish(Set.of());
    }

    /** Website prompts belong to the shown website; covering or closing it answers them with a refusal. */
    private void cancelPrompts() {
        cancelAsk();
        Runnable cancel = cancelAuth;
        cancelAuth = null;
        if (cancel != null) cancel.run();
    }

    /**
     * A hidden page's JavaScript dialog shows at once as Genesis's own dialog over the applet UI.
     * The host only learns that it is open, so the page's calls stop using up their budget.
     */
    @Override public void jsDialog(Views.Page page, String kind, String message, String defaultValue, Requests.DialogResult result) {
        if (pages.get(key(page.ref)) != page) { result.cancel(); return; }
        long token = ++nextDialog;
        PendingDialog dialog = new PendingDialog(page, kind, message, defaultValue, result);
        dialogs.put(token, dialog);
        try { owner.send(Bridge.event("jsDialog").put("view", page.ref).put("token", token)); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
        showDialog(token, dialog);
    }

    /** A server's own sign-in prompt. Genesis passes the answer on and saves nothing. */
    @Override public void httpAuth(Views.Page page, Requests.AuthRequest handler, String host, String realm) {
        cancelPrompts();
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
        android.widget.EditText user = authField("Username", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_NORMAL);
        android.widget.EditText password = authField("Password", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(user, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout.LayoutParams below = new LinearLayout.LayoutParams(-1, -2);
        below.topMargin = tokens.dp(12);
        form.addView(password, below);
        boolean[] answered = { false };
        Runnable cancel = () -> { if (!answered[0]) { answered[0] = true; handler.cancel(); } };
        android.app.Dialog dialog = new MaterialAlertDialogBuilder(activity)
            .setTitle("Sign in to " + host)
            .setMessage(realm == null || realm.isEmpty() ? "The website asks for a username and password." : "The website says: " + realm)
            .setView(form)
            .setPositiveButton("Sign in", (d, w) -> {
                cancelAuth = null;
                if (answered[0]) return;
                answered[0] = true;
                handler.proceed(user.getText().toString(), password.getText().toString());
            })
            .setNegativeButton("Cancel", (d, w) -> { cancelAuth = null; cancel.run(); })
            .setOnCancelListener(d -> { cancelAuth = null; cancel.run(); })
            .show();
        cancelAuth = () -> { dialog.dismiss(); cancel.run(); };
    }

    private android.widget.EditText authField(String hint, int inputType) {
        android.widget.EditText field = new android.widget.EditText(activity);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setInputType(inputType);
        tokens.style(field, Tokens.Type.BODY_LARGE, tokens.onSurface);
        field.setHintTextColor(tokens.onSurfaceVariant);
        field.setPadding(tokens.dp(14), tokens.dp(12), tokens.dp(14), tokens.dp(12));
        field.setBackground(tokens.outlined(tokens.surface, tokens.outline, 12, false));
        return field;
    }

    /**
     * The system switched between light and dark, or changed the font size. The activity keeps
     * running (the manifest handles `uiMode` and `fontScale`), so the applet and its pages survive;
     * website pages take the new text zoom and the native views the new colors.
     */
    void appearanceChanged() {
        // The font size can change without the appearance; website pages rescale either way.
        GeckoEngine.configurationChanged(activity.getResources().getConfiguration());
        for (Views.Page page : pages.values()) page.tab.configurationChanged();
        if (popup != null) popup.tab.configurationChanged();
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)
            == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        if (dark == tokens.dark) return;
        // The theme still holds the old appearance's colors; apply it again so they resolve for the new one.
        activity.getTheme().applyStyle(R.style.Theme_NirvanaGenesis, true);
        tokens = new Tokens(activity);
        ui.tokens = tokens;
        root.setBackgroundColor(tokens.surface);
        barrier.setBackgroundColor(tokens.surface);
        revealed.setBackgroundColor(tokens.surface);
        popupSheet.setBackgroundColor(tokens.surface);
        splash.restyle(tokens);
        bar.restyle(tokens);
        GenesisMenu.tint(menu, tokens, revealedPage != null);
        tokens.applySystemBars(activity);
        if (home.root.getVisibility() == View.VISIBLE) home.render();
        ui.pages.rebuildAll();
    }

    // -----------------------------------------------------------------------------------------
    // Ui.Actions

    /** Opens an applet, or the offline notice when the phone has no connection. */
    @Override public void openApplet(String id) {
        if (!online()) { notices.offline(id); return; }
        try { owner.send(Bridge.event("openApplet").put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    /**
     * Opens a website link in the applet the user picked, or asks the host which applets use its
     * site when `appletId` is null. `external` marks a link another app shared, so a Back that
     * leaves the applet returns to that app.
     */
    void openUrl(String url, String appletId, boolean external) {
        try {
            owner.send(Bridge.event("openUrl").put("url", url).put("appletId", appletId == null ? JSONObject.NULL : appletId).put("external", external));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /**
     * Every opened link asks first: one "Open in" choice per applet that uses its website, then
     * "Create a new applet". The list has only the second choice when no applet uses the site.
     * Cancel returns to the app that shared the link.
     */
    void chooseApplet(String url, JSONArray applets, boolean external) {
        int count = applets.length();
        String[] choices = new String[count + 1];
        String[] ids = new String[count];
        for (int i = 0; i < count; i++) {
            JSONObject entry = applets.optJSONObject(i);
            ids[i] = entry == null ? "" : entry.optString("appletId");
            choices[i] = "Open in " + (entry == null ? ids[i] : entry.optString("name", ids[i]));
        }
        choices[count] = "Create a new applet";
        new MaterialAlertDialogBuilder(activity)
            .setTitle(linkTitle(url))
            .setItems(choices, (d, which) -> {
                if (which < count) openUrl(url, ids[which], external);
                else ui.pages.push(CreateApplet.TAG, () -> CreateApplet.page(ui, url), null, false);
            })
            .setNegativeButton("Cancel", (d, which) -> leaveFor(external))
            .setOnCancelListener(d -> leaveFor(external))
            .show();
    }

    /** A cancelled chooser for a link another app shared returns to that app, as Back would. */
    private void leaveFor(boolean external) {
        if (external) activity.moveTaskToBack(true);
    }

    /** The chooser's title: the link's host, or the link itself when it has none. */
    static String linkTitle(String url) {
        String host = Uri.parse(url).getHost();
        return host == null || host.isEmpty() ? url : host;
    }

    /** "Open a link": a URL field, prefilled when the clipboard holds a website link. */
    @Override public void openLink() {
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), 0);
        android.widget.EditText field = authField("https://…", android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        String copied = clipboardLink();
        if (copied != null) field.setText(copied);
        form.addView(field, new LinearLayout.LayoutParams(-1, -2));
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Open a link")
            .setMessage("Choose the applet that opens it, or create a new one.")
            .setView(form)
            .setPositiveButton("Open", (d, w) -> {
                String url = field.getText().toString().trim();
                if (!url.isEmpty()) openUrl(url, null, false);
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private String clipboardLink() {
        android.content.ClipboardManager clipboard = activity.getSystemService(android.content.ClipboardManager.class);
        android.content.ClipData clip = clipboard == null ? null : clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return null;
        CharSequence text = clip.getItemAt(0).getText();
        String value = text == null ? "" : text.toString().trim();
        return value.matches("(?i)https?://\\S+") ? value : null;
    }

    /** Sends an event that starts or continues a repository flow, whose pages come back here. */
    private void flowEvent(JSONObject event) {
        GenesisApp.runtime(activity).router.flowStarted(this);
        owner.send(event);
    }

    @Override public void addFromRepository(String input) {
        try { flowEvent(Bridge.event("addFromRepository").put("input", input)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void pickFile() { owner.pickAppletFile(); }

    @Override public void chooseCandidate(String id, String version) {
        try { flowEvent(Bridge.event("chooseCandidate").put("appletId", id).put("version", version == null ? JSONObject.NULL : version)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public void cancelFlow() { owner.send(Bridge.event("cancelFlow")); }

    @Override public void reviewDecision(String reviewId, boolean accept, String replace) {
        try {
            flowEvent(Bridge.event("reviewDecision").put("reviewId", reviewId).put("accept", accept)
                .put("replace", replace == null ? JSONObject.NULL : replace));
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void checkUpdates(String id, boolean manual) {
        try {
            JSONObject event = Bridge.event("checkUpdates").put("appletId", id == null ? JSONObject.NULL : id).put("manual", manual);
            if (manual) flowEvent(event);
            else owner.send(event);
        }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    @Override public void removeApplet(String id) { appletEvent("removeApplet", id); }

    @Override public void clearData(String id) { appletEvent("clearData", id); }

    @Override public void keepVersion(String id) { appletEvent("keepVersion", id); }

    @Override public void menu(String action) {
        try { owner.send(GenesisRuntime.windowEvent("menu", window).put("action", action)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @Override public Connections.Store connections() { return owner.connections(); }

    @Override public SiteData sites() { return sites; }

    // -----------------------------------------------------------------------------------------
    // Separate sign-ins

    private static final String DELETE_PROFILES = "deleteProfiles";

    private static String profileKey(String appletId) { return "profile:" + appletId; }

    private static String profileNameKey(String appletId) { return "profileName:" + appletId; }

    private static android.content.SharedPreferences state(android.content.Context context) {
        return context.getSharedPreferences("genesis-shell", android.content.Context.MODE_PRIVATE);
    }

    /** Each time the switch turns on the applet gets a new profile, so an old one that is still being deleted is never reused. */
    private static String profileName(android.content.SharedPreferences state, String appletId) {
        return state.getString(profileNameKey(appletId), "applet-" + appletId);
    }

    private String profileName(String appletId) { return profileName(state, appletId); }

    /**
     * The applet's own profile when it keeps a separate sign-in, otherwise the shared one, in the
     * engine the applet runs its websites in.
     */
    @Override public SiteData sitesFor(String appletId) {
        if (appletId == null) return sites;
        boolean gecko = GeckoEngine.ID.equals(engine(state, appletId));
        boolean separate = separateSignIn(appletId);
        if (!gecko && !separate) return sites;
        // Another window may have switched the applet to a new profile or engine, so the cached one must match.
        String name = separate ? profileName(appletId) : null;
        String key = (gecko ? GeckoEngine.ID : WebViewSites.ENGINE) + ":" + appletId;
        SiteData cached = profiles.get(key);
        if (cached == null || name != null && !name.equals(cached.profile) || name == null && !cached.isDefault()) {
            cached = sites(activity, gecko, name);
            profiles.put(key, cached);
        }
        return cached;
    }

    /** The same, for work outside a window, such as a cookie import. */
    static SiteData sitesFor(android.content.Context context, String appletId) {
        if (appletId == null) return WebViewSites.defaultProfile(context);
        android.content.SharedPreferences state = state(context);
        boolean gecko = GeckoEngine.ID.equals(engine(state, appletId));
        boolean separate = (gecko || WebViewSites.profilesSupported()) && state.getBoolean(profileKey(appletId), false);
        return sites(context, gecko, separate ? profileName(state, appletId) : null);
    }

    /** A profile of either engine; a null name is the engine's shared one. */
    private static SiteData sites(android.content.Context context, boolean gecko, String name) {
        if (gecko) return name == null ? GeckoSites.defaultProfile(context) : GeckoSites.profile(context, name);
        return name == null ? WebViewSites.defaultProfile(context) : WebViewSites.profile(context, name);
    }

    // -----------------------------------------------------------------------------------------
    // Website engine

    private static String engineKey(String appletId) { return "engine:" + appletId; }

    /** The engine an applet's website contexts run in: `webview` unless the applet was set to `gecko`. */
    private static String engine(android.content.SharedPreferences state, String appletId) {
        return state.getString(engineKey(appletId), WebViewSites.ENGINE);
    }

    /** Set once the applet first runs in GeckoView, so removing it also deletes its GeckoView sign-in. */
    private static String geckoUsedKey(String appletId) { return "engineUsed:" + appletId + ":gecko"; }

    @Override public String engine(String appletId) { return engine(state, appletId); }

    /**
     * Moves the applet's websites to the other engine. Each engine keeps its own sign-ins, so the
     * applet starts signed out there and finds its old sign-ins again when it comes back. An open
     * applet reopens, as it does when its sign-in changes.
     */
    @Override public void setEngine(String appletId, String engine) {
        if (engine.equals(engine(appletId))) return;
        if (GeckoEngine.ID.equals(engine)) state.edit().putString(engineKey(appletId), engine).putBoolean(geckoUsedKey(appletId), true).apply();
        else state.edit().remove(engineKey(appletId)).apply();
        forgetProfile(appletId);
        try { owner.send(GenesisRuntime.windowEvent("menu", appletId).put("action", "reload")); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
        ui.pages.refresh();
    }

    // -----------------------------------------------------------------------------------------
    // Engine features

    /** Features an applet needed while it was not in front, keyed by applet id and feature; shared by every window. */
    private static final Map<String, EngineFeatures.Feature> featuresWaiting = new java.util.LinkedHashMap<>();
    /** Applet and feature pairs already asked about in this process: each is asked at most once. */
    private static final Set<String> featuresAsked = new java.util.HashSet<>();
    /** True between the window's resume and pause. */
    private boolean inFront;
    /** The open engine-switch question, or null. */
    private android.app.Dialog featureDialog;

    private static String featureKey(String appletId, EngineFeatures.Feature feature) { return appletId + "\n" + feature.key; }

    private static String engineAskKey(String appletId, EngineFeatures.Feature feature) { return "engineAsk:" + appletId + ":" + feature.key; }

    /**
     * The applet ran into a feature its engine lacks. The switch question waits until the applet is
     * in front, and is asked at most once per process; "Don't ask again" keeps it from coming back.
     */
    static void featureNeeded(android.content.Context context, String appletId, EngineFeatures.Feature feature) {
        if (appletId == null || appletId.isEmpty()) return;
        android.content.SharedPreferences state = state(context);
        if (EngineFeatures.switchTarget(feature, engine(state, appletId)) == null || state.getBoolean(engineAskKey(appletId, feature), false)) return;
        String key = featureKey(appletId, feature);
        if (featuresAsked.contains(key)) return;
        featuresWaiting.put(key, feature);
    }

    @Override public void featureNeeded(Views.Page page, EngineFeatures.Feature feature) {
        featureNeeded(activity, page.ref.optString("appletId"), feature);
        askWaitingFeature();
    }

    void frontChanged(boolean front) {
        inFront = front;
        askWaitingFeature();
    }

    /** Asks about the first feature the applet in front is waiting on, one question at a time. */
    void askWaitingFeature() {
        if (!inFront || appletId == null || featureDialog != null || activity.isFinishing()) return;
        for (Map.Entry<String, EngineFeatures.Feature> waiting : featuresWaiting.entrySet()) {
            if (!waiting.getKey().equals(featureKey(appletId, waiting.getValue()))) continue;
            featuresWaiting.remove(waiting.getKey());
            String to = EngineFeatures.switchTarget(waiting.getValue(), engine(appletId));
            if (to == null) { askWaitingFeature(); return; }
            featuresAsked.add(waiting.getKey());
            askSwitch(appletId, appletName, waiting.getValue(), to, true);
            return;
        }
    }

    /** Applet info's "Needs GeckoView on this phone" row: the user asked, so it always shows. */
    @Override public void offerSeparateSignIn(String id) {
        JSONObject entry = ui.entry(id);
        String to = EngineFeatures.switchTarget(EngineFeatures.Feature.SEPARATE_SIGN_IN, engine(id));
        if (entry == null || to == null || featureDialog != null) return;
        askSwitch(id, entry.optString("name"), EngineFeatures.Feature.SEPARATE_SIGN_IN, to, false);
    }

    private void askSwitch(String id, String name, EngineFeatures.Feature feature, String to, boolean offerQuiet) {
        boolean gecko = GeckoEngine.ID.equals(to);
        String from = gecko ? "WebView" : "GeckoView", target = gecko ? "GeckoView" : "Android WebView";
        String title = feature == EngineFeatures.Feature.SEPARATE_SIGN_IN
            ? "A separate sign-in needs GeckoView on this phone" : feature.title + " doesn't work in " + from;
        MaterialAlertDialogBuilder builder = new MaterialAlertDialogBuilder(activity).setTitle(title)
            .setMessage("Run " + name + " in " + target + " instead? You will need to sign in to its websites again.");
        com.google.android.material.checkbox.MaterialCheckBox quiet = null;
        if (offerQuiet) {
            quiet = new com.google.android.material.checkbox.MaterialCheckBox(activity);
            quiet.setText("Don't ask again for this applet");
            FrameLayout box = new FrameLayout(activity);
            box.setPadding(tokens.dp(20), tokens.dp(8), tokens.dp(24), 0);
            box.addView(quiet);
            builder.setView(box);
        }
        com.google.android.material.checkbox.MaterialCheckBox remember = quiet;
        featureDialog = builder
            .setNegativeButton("Not now", null)
            .setPositiveButton("Switch to " + target, (dialog, which) -> setEngine(id, to))
            .setOnDismissListener(dialog -> {
                if (remember != null && remember.isChecked()) state.edit().putBoolean(engineAskKey(id, feature), true).apply();
                featureDialog = null;
                askWaitingFeature();
            })
            .show();
    }

    @Override public void addToHomeScreen(String appletId) {
        GenesisApp.runtime(activity).shortcuts.pin(activity, ui.entry(appletId),
            () -> showInfo("Add to home screen", "Your launcher can't add icons. Open the applet from Genesis."));
    }

    // -----------------------------------------------------------------------------------------
    // Notifications

    @Override public boolean notificationsOn(String appletId) { return GenesisApp.runtime(activity).notifications.on(appletId); }

    /**
     * Android 13+ asks the user first. When Android refuses for good, or notifications are off
     * for all of Genesis, Genesis points to Android's notification settings.
     */
    @Override public void setNotificationsOn(String appletId, boolean on, java.util.function.Consumer<Boolean> result) {
        Notifications notifications = GenesisApp.runtime(activity).notifications;
        JSONObject entry = ui.entry(appletId);
        if (!on || entry == null) { notifications.turnOff(appletId); result.accept(false); return; }
        if (Build.VERSION.SDK_INT < 33) { turnOnNotifications(entry, result); return; }
        String permission = android.Manifest.permission.POST_NOTIFICATIONS;
        owner.requestPermissions(new String[] { permission }, granted -> {
            if (granted != null && granted.contains(permission)) { turnOnNotifications(entry, result); return; }
            result.accept(false);
            if (granted != null && !activity.shouldShowRequestPermissionRationale(permission)) showNotificationSettings(entry.optString("name"));
        });
    }

    private void turnOnNotifications(JSONObject entry, java.util.function.Consumer<Boolean> result) {
        GenesisApp.runtime(activity).notifications.turnOn(entry);
        result.accept(true);
        if (!androidx.core.app.NotificationManagerCompat.from(activity).areNotificationsEnabled()) showNotificationSettings(entry.optString("name"));
    }

    private void showNotificationSettings(String name) {
        new MaterialAlertDialogBuilder(activity)
            .setTitle("Android blocks notifications from Genesis")
            .setMessage("Allow them for Genesis in Android's settings, so " + name + " can notify you.")
            .setPositiveButton("Open settings", (d, w) -> activity.startActivity(
                new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, activity.getPackageName())))
            .setNegativeButton("Not now", null)
            .show();
    }

    @Override public boolean separateSignInAvailable() { return WebViewSites.profilesSupported(); }

    @Override public boolean separateSignIn(String appletId) {
        return (WebViewSites.profilesSupported() || GeckoEngine.ID.equals(engine(state, appletId))) && state.getBoolean(profileKey(appletId), false);
    }

    /**
     * Turning it on starts the applet signed out in a new profile; turning it off returns it to the
     * shared sign-in and deletes its profile once no WebView uses it. An open applet reopens.
     */
    @Override public void setSeparateSignIn(String appletId, boolean on) {
        if (on == separateSignIn(appletId)) return;
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        if (on) {
            String name = "applet-" + appletId + "-" + Long.toString(System.currentTimeMillis(), 36);
            state.edit().putBoolean(profileKey(appletId), true).putString(profileNameKey(appletId), name).apply();
        } else {
            queueDeletion(state, appletId, pending);
            state.edit().remove(profileKey(appletId)).remove(profileNameKey(appletId)).putStringSet(DELETE_PROFILES, pending).apply();
        }
        forgetProfile(appletId);
        // The applet restarts in its new sign-in wherever it runs; the host ignores this for an applet that is not running.
        try { owner.send(GenesisRuntime.windowEvent("menu", appletId).put("action", "reload")); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
        ui.pages.refresh();
    }

    // -----------------------------------------------------------------------------------------
    // Hide in recent apps

    private static String privacyKey(String appletId) { return "applet-privacy/" + appletId; }

    static boolean hiddenInRecents(android.content.Context context, String appletId) {
        return state(context).getBoolean(privacyKey(appletId), false);
    }

    @Override public boolean hiddenInRecents(String appletId) { return state.getBoolean(privacyKey(appletId), false); }

    @Override public void setHiddenInRecents(String appletId, boolean on) {
        if (on) state.edit().putBoolean(privacyKey(appletId), true).apply();
        else state.edit().remove(privacyKey(appletId)).apply();
        owner.privacyChanged(appletId);
    }

    /**
     * Android 13+ can leave the Recents card blank on its own. Earlier versions only offer
     * FLAG_SECURE, which also blocks screenshots and screen recording of the window.
     */
    static void applyPrivacy(Activity activity, String appletId) {
        boolean hidden = hiddenInRecents(activity, appletId);
        if (Build.VERSION.SDK_INT >= 33) activity.setRecentsScreenshotEnabled(!hidden);
        else if (hidden) activity.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        else activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
    }

    /** This window lets go of a removed or erased applet's profile. */
    void forgetProfile(String appletId) {
        profiles.remove(WebViewSites.ENGINE + ":" + appletId);
        profiles.remove(GeckoEngine.ID + ":" + appletId);
    }

    /** A removed or erased applet's separate sign-in goes with it. */
    static void forgetProfile(android.content.Context context, String appletId) {
        android.content.SharedPreferences state = state(context);
        if (!state.getBoolean(profileKey(appletId), false)) return;
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        queueDeletion(state, appletId, pending);
        state.edit().remove(profileKey(appletId)).remove(profileNameKey(appletId)).putStringSet(DELETE_PROFILES, pending).apply();
    }

    /** A removed or erased applet's Genesis choices go with it. */
    static void forgetApplet(android.content.Context context, String appletId) {
        forgetProfile(context, appletId);
        android.content.SharedPreferences.Editor edit = state(context).edit()
            .remove(privacyKey(appletId)).remove(engineKey(appletId)).remove(geckoUsedKey(appletId));
        for (EngineFeatures.Feature feature : EngineFeatures.Feature.values()) edit.remove(engineAskKey(appletId, feature));
        edit.apply();
    }

    /**
     * Queues the applet's separate sign-in for deletion in each engine it ran in. GeckoView's is
     * queued only when the applet ever used GeckoView, so deleting it never starts GeckoView for nothing.
     */
    private static void queueDeletion(android.content.SharedPreferences state, String appletId, Set<String> pending) {
        String name = profileName(state, appletId);
        pending.add(deletionEntry(WebViewSites.ENGINE, name));
        if (state.getBoolean(geckoUsedKey(appletId), false)) pending.add(deletionEntry(GeckoEngine.ID, name));
    }

    /**
     * A profile waiting for deletion is stored as `<engine>:<name>`, so each engine deletes its
     * own. An entry without a prefix was written before engines existed and is a WebView profile.
     */
    private static String deletionEntry(String engine, String profile) { return engine + ":" + profile; }

    /** Deletes the profiles waiting for deletion; one a page still holds waits for the next launcher. */
    private void deleteProfiles() {
        Set<String> pending = new LinkedHashSet<>(state.getStringSet(DELETE_PROFILES, Set.of()));
        if (pending.isEmpty()) return;
        pending.removeIf(this::deleteProfile);
        state.edit().putStringSet(DELETE_PROFILES, pending).apply();
    }

    /** Returns whether the entry's profile is gone. An engine this build does not run keeps its entry. */
    private boolean deleteProfile(String entry) {
        String prefix = WebViewSites.ENGINE + ":";
        if (entry.startsWith(prefix)) return WebViewSites.delete(activity, entry.substring(prefix.length()));
        String gecko = GeckoEngine.ID + ":";
        if (entry.startsWith(gecko)) return GeckoSites.delete(activity, entry.substring(gecko.length()));
        if (entry.matches("[a-z]+:.*")) return false;
        return WebViewSites.delete(activity, entry);
    }

    @Override public void storageSize(java.util.function.LongConsumer result) { owner.storageSize(result); }

    private void appletEvent(String type, String id) {
        try { owner.send(Bridge.event(type).put("appletId", id)); }
        catch (JSONException ignored) { /* Unreachable for string values. */ }
    }

    @SuppressWarnings("deprecation")
    private boolean online() {
        ConnectivityManager manager = activity.getSystemService(ConnectivityManager.class);
        if (manager == null) return true;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    // -----------------------------------------------------------------------------------------
    // The Genesis button and menu

    /** Top end, 6 dp from the edges, inside the website bar's free end while a website shows. */
    private FrameLayout.LayoutParams menuLayout() {
        FrameLayout.LayoutParams layout = new FrameLayout.LayoutParams(tokens.dp(48), tokens.dp(48), Gravity.TOP | Gravity.END);
        layout.setMargins(tokens.dp(6), tokens.dp(8), tokens.dp(6), tokens.dp(6));
        return layout;
    }

    private void openMenu() {
        if (appletId == null) return;
        String url = revealedPage != null ? revealedUrl() : contextUrl();
        GenesisMenu.show(ui, appletName == null ? appletId : appletName, ui.entry(appletId), url, revealedPage != null, this::menuAction);
    }

    private void menuAction(GenesisMenu.Action action) {
        switch (action) {
            case HOME: menu("home"); return;
            case RELOAD: menu("reload"); return;
            case VIEW_WEBSITE: websiteChosen = true; menu("viewWebsite"); return;
            case INFO: if (appletId != null) manage.info(appletId); return;
            case SERVICES: if (appletId != null) connections.open(appletId); return;
            case OPEN_IN_BROWSER: { String url = revealedUrl(); if (url != null) openExternal(url); return; }
            case COPY_LINK: { String url = revealedUrl(); if (url != null) tokens.copy("Link", url); return; }
            default:
        }
    }

    /** The URL of the applet's first website context, shown in the menu over the applet's own screens. */
    private String contextUrl() {
        for (Views.Page page : pages.values()) if (page.isContext() && page.tab.url() != null) return page.tab.url();
        return null;
    }

    /** What the user sees: the popup while one is open, otherwise the revealed context. */
    private String revealedUrl() {
        if (popup != null) return popup.tab.url();
        return revealedPage == null ? null : revealedPage.tab.url();
    }

    private Views.Page foregroundPage() {
        for (Views.Page page : pages.values()) if (page.isForeground()) return page;
        return null;
    }

    boolean hasForeground() { return foregroundPage() != null; }

    /** The page `ref` names, or null. */
    Views.Page page(JSONObject ref) { return pages.get(key(ref)); }

    private static String key(JSONObject ref) { return ref.optString("appletId") + "\n" + ref.optString("role"); }

    private static Set<String> set(JSONArray values) throws JSONException {
        Set<String> result = new LinkedHashSet<>();
        for (int i = 0; i < values.length(); i++) result.add(values.getString(i));
        return result;
    }

    @SuppressWarnings("deprecation")
    private static void applyInsets(View view) {
        view.setOnApplyWindowInsetsListener((target, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                target.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsets.CONSUMED;
            }
            target.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
    }
}
