package app.nirvana.genesis;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.Menu;
import android.view.SubMenu;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ImageButton;
import android.widget.PopupMenu;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.ProgressBar;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Native Apps launcher and floating host controls, independent of creator UI. */
final class HostViews {
    private static final int APP_HEADER_HEIGHT = 68;
    private static final int SECTION_BAR_HEIGHT = 64;
    private static final int READER_BAR_HEIGHT = 56;
    interface Events { void send(JSONObject event); }
    final FrameLayout browserSlot;
    private final Activity activity;
    private int paper, ink, wash, accent;
    private final Events events;
    private final FrameLayout content;
    private final ScrollView cover;
    private final TextView coverTitle, coverMessage;
    private final LinearLayout loadingSkeleton;
    private final LinearLayout recovery;
    private final LinearLayout siteRecovery;
    private final ImageButton floatingMenu;
    private final LinearLayout readerBar;
    private final TextView readerOrigin;
    private final ImageButton readerBack, readerForward;
    private final ProgressBar pageProgress;
    private String readerUrl = "";
    private PopupMenu activeMenu;
    private JSONArray actions = new JSONArray();
    private String presentationState = "loading", presentationMessage = "";
    private boolean fullscreen;
    private boolean readerVisible;
    private boolean isolatedApplet;
    private boolean appletActive;
    private JSONObject shell;
    private JSONArray sourceEntries = new JSONArray();
    private String appletId, sourceId, pageId, sectionId;
    private LinearLayout appHeader, sections;
    private TextView brand;
    private ImageButton appBack, appOptions;
    private Button choices;
    private boolean customizedRoute, detailRoute;


    @SuppressWarnings("deprecation")
    HostViews(Activity activity, Events events) {
        this.activity = activity; this.events = events;
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        paper = Color.parseColor(dark ? "#1d1b18" : "#faf7f2");
        accent = Color.parseColor(dark ? "#ff995f" : "#b93800");
        ink = Color.parseColor(dark ? "#f5eee4" : "#24211c");
        wash = Color.parseColor(dark ? "#363027" : "#f3e9dc");
        content = new FrameLayout(activity); content.setBackgroundColor(paper);
        content.addOnLayoutChangeListener((v, l, t, r, b, oldL, oldT, oldR, oldB) -> alignHeaderInsets());
        content.setSystemUiVisibility(dark ? 0 : View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        browserSlot = new FrameLayout(activity); content.addView(browserSlot, new FrameLayout.LayoutParams(-1, -1));

        readerBar = new LinearLayout(activity); readerBar.setGravity(Gravity.CENTER_VERTICAL);
        readerBar.setPadding(dp(8), 0, dp(8), 0); readerBar.setBackgroundColor(paper);
        readerBack = iconButton(R.drawable.ic_nav_back, "Back", () -> events.send(event("back")));
        readerForward = iconButton(R.drawable.ic_nav_forward, "Forward", () -> events.send(event("forward")));
        ImageButton close = iconButton(R.drawable.ic_nav_close, "Close reader", () -> events.send(event("readerClose")));
        readerOrigin = text("", 14); readerOrigin.setSingleLine(true); readerOrigin.setEllipsize(android.text.TextUtils.TruncateAt.END);
        readerBar.addView(readerBack, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.addView(readerForward, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.addView(readerOrigin, new LinearLayout.LayoutParams(0, -2, 1));
        readerBar.addView(close, new LinearLayout.LayoutParams(dp(48), dp(48)));
        ImageButton more = iconButton(R.drawable.ic_nav_more, "Reader options", () -> readerMenu());
        readerBar.addView(more, new LinearLayout.LayoutParams(dp(48), dp(48)));
        readerBar.setVisibility(View.GONE);
        content.addView(readerBar, new FrameLayout.LayoutParams(-1, dp(READER_BAR_HEIGHT), Gravity.TOP));
        pageProgress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        pageProgress.setMax(100); pageProgress.setIndeterminate(true); pageProgress.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP);
        content.addView(pageProgress, progressLayout);

        LinearLayout notice = new LinearLayout(activity); notice.setOrientation(LinearLayout.VERTICAL);
        notice.setGravity(Gravity.CENTER); notice.setPadding(dp(28), dp(28), dp(28), dp(88));
        coverTitle = text("", 24); coverTitle.setTypeface(null, Typeface.BOLD); coverTitle.setGravity(Gravity.CENTER);
        coverMessage = text("", 16); coverMessage.setGravity(Gravity.CENTER); coverMessage.setPadding(0, dp(12), 0, dp(20));
        coverMessage.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        notice.addView(coverTitle); notice.addView(coverMessage);
        loadingSkeleton = new LinearLayout(activity); loadingSkeleton.setOrientation(LinearLayout.VERTICAL);
        loadingSkeleton.setContentDescription("Loading page");
        loadingSkeleton.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        for(int row=0;row<3;row++) {
            LinearLayout group=new LinearLayout(activity);group.setOrientation(LinearLayout.VERTICAL);group.setPadding(0,dp(16),0,dp(16));
            for(int line=0;line<3;line++) {
                View block=new View(activity);block.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
                LinearLayout.LayoutParams shape=new LinearLayout.LayoutParams(line==1?-1:dp(line==0?128:196),dp(line==0?14:10));shape.bottomMargin=dp(12);
                group.addView(block,shape);
            }
            loadingSkeleton.addView(group,new LinearLayout.LayoutParams(-1,-2));
        }
        notice.addView(loadingSkeleton,new LinearLayout.LayoutParams(-1,-2));
        loadingSkeleton.setVisibility(View.GONE);
        recovery = new LinearLayout(activity); recovery.setOrientation(LinearLayout.VERTICAL);
        recovery.addView(button("Retry", () -> events.send(event("retry"))));
        recovery.addView(button("Back", () -> events.send(event("back"))));
        recovery.addView(button("View original page", () -> events.send(event("ordinary"))));
        recovery.addView(button("Return to Genesis", () -> events.send(event("home"))));
        notice.addView(recovery);
        siteRecovery = new LinearLayout(activity); siteRecovery.setOrientation(LinearLayout.VERTICAL);
        siteRecovery.addView(button("Retry page", () -> events.send(event("reload"))));
        siteRecovery.addView(button("Back", () -> events.send(event("back"))));
        siteRecovery.addView(button("Open in browser", () -> events.send(event("openBrowser"))));
        notice.addView(siteRecovery); siteRecovery.setVisibility(View.GONE);
        cover = new ScrollView(activity); cover.setFillViewport(true); cover.setBackgroundColor(paper);
        cover.addView(notice, new ScrollView.LayoutParams(-1, -2)); cover.setVisibility(View.GONE);
        content.addView(cover, new FrameLayout.LayoutParams(-1, -1));

        floatingMenu = new ImageButton(activity);
        floatingMenu.setImageResource(R.drawable.ic_genesis_plus);
        floatingMenu.setScaleType(android.widget.ImageView.ScaleType.CENTER);
        floatingMenu.setContentDescription("Genesis menu"); floatingMenu.setTooltipText("Genesis menu");
        floatingMenu.setPadding(0, 0, 0, 0); floatingMenu.setElevation(dp(4));
        floatingMenu.setBackgroundTintList(null);
        GradientDrawable circle = new GradientDrawable(); circle.setShape(GradientDrawable.OVAL); circle.setColor(Color.rgb(140, 21, 21));
        floatingMenu.setBackground(new RippleDrawable(ColorStateList.valueOf(0x40ffffff), circle, null));
        floatingMenu.setOnClickListener(view -> menu());
        FrameLayout.LayoutParams floating = new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.BOTTOM | Gravity.RIGHT);
        floating.setMargins(dp(16), dp(16), dp(16), dp(16));
        content.addView(floatingMenu, floating); floatingMenu.setVisibility(View.GONE);
        activity.setContentView(content);
    }

    void configureShell(JSONObject command, PackageAssets assets) throws Exception {
        isolatedApplet=command.getJSONObject("package").getJSONObject("manifest").optInt("schemaVersion")==2;
        appletActive = true;
        JSONObject manifest = command.getJSONObject("package").getJSONObject("manifest");
        sourceEntries = manifest.getJSONArray("sources");
        shell = manifest.optJSONObject("shell"); appletId = manifest.getString("id");
        palette(shell != null && "neutral".equals(shell.optString("colorScheme")));
        JSONObject selection = command.getJSONObject("selection");
        sectionId = selection.optString("sectionId", "");
        sourceId = selection.getString("sourceId"); pageId = selection.isNull("pageId") ? "" : selection.optString("pageId");
        JSONObject owner = command.optJSONObject("ownerSelection");
        if (owner != null) { sourceId = owner.getString("sourceId"); pageId = owner.isNull("pageId") ? "" : owner.getString("pageId"); }
        if (appHeader != null) content.removeView(appHeader);
        if (sections != null) content.removeView(sections);
        appOptions = null;
        if (shell == null) return;
        appHeader = new LinearLayout(activity); appHeader.setGravity(Gravity.CENTER_VERTICAL); appHeader.setBackgroundColor(paper);
        appBack = iconButton(R.drawable.ic_nav_back, "Back", () -> events.send(event("back")));
        LinearLayout.LayoutParams backLayout = new LinearLayout.LayoutParams(dp(48), dp(48));
        backLayout.setMarginEnd(dp(4)); appHeader.addView(appBack, backLayout);
        android.widget.ImageView logo = new android.widget.ImageView(activity);
        byte[] bytes = assets.bytes(shell.getString("brandAsset"));
        logo.setImageBitmap(android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length));
        logo.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        appHeader.addView(logo, new LinearLayout.LayoutParams(dp(28), dp(28)));
        brand = text(shell.getString("title"), 17); brand.setTypeface(null, Typeface.BOLD); brand.setPadding(dp(10), 0, dp(8), 0);
        brand.setSingleLine(true); brand.setEllipsize(android.text.TextUtils.TruncateAt.END);
        brand.setOnLongClickListener(v -> { menu(); return true; });
        appHeader.addView(brand, new LinearLayout.LayoutParams(0, -2, 1));
        appOptions = iconButton(R.drawable.ic_nav_more, "Applet options", () -> menu());
        appHeader.addView(appOptions, new LinearLayout.LayoutParams(dp(48), dp(48)));
        choices = button("View", () -> {
            PopupMenu popup = new PopupMenu(activity, choices, Gravity.END);
            JSONArray items = shell.optJSONArray("choices");
            if (items != null) for (int i = 0; i < items.length(); i++) {
                JSONObject choice = items.optJSONObject(i);
                String label = choice.optString("label");
                popup.getMenu().add(0, i, i, label).setCheckable(true).setChecked(label.contentEquals(choices.getText()))
                    .setOnMenuItemClickListener(item -> { events.send(open(choice.optString("sourceId", shell.optJSONArray("sections").optJSONObject(0).optString("sourceId")), null, choice.optString("url"))); return true; });
            }
            popup.getMenu().setGroupCheckable(0, true, true);
            popup.show();
        });
        choices.setTextSize(13); choices.setTypeface(null, Typeface.BOLD); choices.setSingleLine(true);
        choices.setPadding(dp(14), 0, dp(12), 0); choices.setCompoundDrawablePadding(dp(6));
        android.graphics.drawable.Drawable chevron = activity.getDrawable(R.drawable.ic_nav_expand).mutate();
        chevron.setTint(ink); chevron.setBounds(0, 0, dp(18), dp(18));
        choices.setCompoundDrawablesRelative(null, null, chevron, null);
        styleChromeControl(choices, wash, 24);
        appHeader.addView(choices, new LinearLayout.LayoutParams(-2, dp(48)));
        content.addView(appHeader, new FrameLayout.LayoutParams(-1, dp(APP_HEADER_HEIGHT), Gravity.TOP));
        alignHeaderInsets();
        sections = new LinearLayout(activity); sections.setBackgroundColor(paper);
        sections.setMinimumHeight(dp(SECTION_BAR_HEIGHT));
        sections.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (bottom - top != oldBottom - oldTop) alignContentInsets();
        });
        sections.setPadding(dp(8), dp(4), dp(8), dp(4));
        JSONArray entries = shell.optJSONArray("sections");
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i);
            Button tab = button(entry.getString("label"), () -> events.send(openSection(entry)));
            tab.setTextSize(11); tab.setPadding(0, dp(4), 0, dp(4));
            tab.setGravity(activity.getResources().getConfiguration().fontScale > 1.3f ? Gravity.TOP | Gravity.CENTER_HORIZONTAL : Gravity.CENTER);
            tab.setSingleLine(false); tab.setMaxLines(2); tab.setEllipsize(android.text.TextUtils.TruncateAt.END);
            boolean selected = !sectionId.isEmpty() ? sectionId.equals(entry.optString("id")) : sourceId.equals(entry.optString("sourceId")) && pageId.equals(entry.isNull("pageId") ? "" : entry.optString("pageId"));
            tab.setSelected(selected); tab.setTextColor(selected ? accent : ink); tab.setTypeface(null, selected ? Typeface.BOLD : Typeface.NORMAL); tab.setContentDescription(entry.getString("label") + (selected ? ", selected" : ""));
            styleChromeControl(tab, selected ? wash : Color.TRANSPARENT, 16);
            int iconResource = sectionIcon(entry.optString("icon"));
            if (iconResource != 0) {
                android.graphics.drawable.Drawable icon = activity.getDrawable(iconResource).mutate();
                icon.setTint(selected ? accent : ink); icon.setBounds(0, 0, dp(22), dp(22));
                tab.setCompoundDrawables(null, icon, null, null); tab.setCompoundDrawablePadding(dp(3));
            }
            LinearLayout.LayoutParams tabLayout = new LinearLayout.LayoutParams(0, -1, 1);
            tabLayout.setMargins(dp(2), 0, dp(2), 0); sections.addView(tab, tabLayout);
        }
        int available = content.getWidth() - content.getPaddingLeft() - content.getPaddingRight();
        if (available <= 0) available = dp(activity.getResources().getConfiguration().screenWidthDp);
        int tabWidth = (available - dp(16) - entries.length() * dp(4)) / Math.max(1, entries.length());
        boolean allHaveIcons = true, labelsNeedSpace = false;
        for (int i = 0; i < sections.getChildCount(); i++) {
            Button tab = (Button) sections.getChildAt(i);
            allHaveIcons &= tab.getCompoundDrawables()[1] != null;
            labelsNeedSpace |= tab.getPaint().measureText(tab.getText().toString()) + dp(8) > tabWidth;
        }
        if (activity.getResources().getConfiguration().fontScale > 1.3f && allHaveIcons && labelsNeedSpace) {
            for (int i = 0; i < sections.getChildCount(); i++) {
                Button tab = (Button) sections.getChildAt(i);
                tab.setTooltipText(entries.getJSONObject(i).getString("label"));
                tab.setText(""); tab.setGravity(Gravity.CENTER); tab.setCompoundDrawablePadding(0);
                android.graphics.drawable.Drawable icon = tab.getCompoundDrawables()[1];
                icon.setBounds(0, 0, dp(28), dp(28)); tab.setCompoundDrawables(null, icon, null, null);
            }
        }
        content.addView(sections, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    }
    private void palette(boolean neutral) {
        boolean dark = (activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        paper = Color.parseColor(neutral ? dark ? "#000000" : "#ffffff" : dark ? "#1d1b18" : "#faf7f2");
        ink = Color.parseColor(neutral ? dark ? "#e7e9ea" : "#0f1419" : dark ? "#f5eee4" : "#24211c");
        accent = Color.parseColor(neutral ? dark ? "#e7e9ea" : "#0f1419" : dark ? "#ff995f" : "#b93800");
        wash = Color.parseColor(neutral ? dark ? "#16181c" : "#eff3f4" : dark ? "#363027" : "#f3e9dc");
        content.setBackgroundColor(paper); cover.setBackgroundColor(paper); readerBar.setBackgroundColor(paper);
        coverTitle.setTextColor(ink); coverMessage.setTextColor(ink); readerOrigin.setTextColor(ink);
        readerBack.setColorFilter(ink); readerForward.setColorFilter(ink);
    }
    private JSONObject openSection(JSONObject entry) {
        String source = entry.optString("sourceId");
        String page = entry.isNull("pageId") ? null : entry.optString("pageId");
        String url = null;
        if (isolatedApplet) {
            // A primary tab opens its declared entry, rather than a remembered child.
            // An explicit empty page also clears a remembered internal owned page.
            if (page == null) page = "";
            for (int i = 0; i < sourceEntries.length(); i++) {
                JSONObject candidate = sourceEntries.optJSONObject(i);
                if (candidate != null && source.equals(candidate.optString("id"))) {
                    url = candidate.optString("startUrl");
                    break;
                }
            }
        }
        JSONObject event = open(source, page, url);
        try {
            event.put("sectionId", entry.getString("id"));
            if (isolatedApplet) event.put("resetForeground", true);
        } catch (JSONException error) { throw new IllegalArgumentException(error); }
        return event;
    }
    private int sectionIcon(String name) {
        switch (name) {
            case "home": return R.drawable.ic_section_home;
            case "search": return R.drawable.ic_section_search;
            case "post": return R.drawable.ic_section_post;
            case "bookmark": return R.drawable.ic_section_bookmark;
            case "person": return R.drawable.ic_section_person;
            case "notifications": return R.drawable.ic_section_notifications;
            default: return 0;
        }
    }
    private JSONObject open(String source, String page, String url) {
        JSONObject event = event("open");
        try { event.put("appletId", appletId).put("sourceId", source); if (page != null) event.put("pageId", page); if (url != null) event.put("url", url); }
        catch (JSONException error) { throw new IllegalStateException(error); }
        return event;
    }
    void route(boolean customized, boolean detail) { customizedRoute = customized; detailRoute = detail; }
    void modal(boolean open) {
        floatingMenu.setEnabled(!open);
        if (appOptions != null) appOptions.setEnabled(!open);
        if (sections != null) for (int i = 0; i < sections.getChildCount(); i++) sections.getChildAt(i).setEnabled(!open);
    }
    private int entryDirection;
    void transitionDirection(int direction) { entryDirection = Integer.signum(direction); }
    void reveal() {
        boolean entering = cover.getVisibility() == View.VISIBLE;
        cover.setVisibility(View.GONE);
        browserSlot.animate().cancel(); browserSlot.setAlpha(1f); browserSlot.setTranslationX(0); browserSlot.setTranslationY(0);
        browserSlot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        if (entering && android.animation.ValueAnimator.areAnimatorsEnabled()) {
            browserSlot.animate().cancel(); browserSlot.setAlpha(0f); browserSlot.setTranslationX(dp(24) * entryDirection);
            browserSlot.animate().alpha(1f).translationX(0).setDuration(entryDirection == 0 ? 120 : 200)
                .setInterpolator(new android.view.animation.DecelerateInterpolator()).start();
        }
    }
    void launcher(JSONArray entries, String message) throws JSONException {
        dismissMenu(); fullscreen = false; readerVisible = false; appletActive = false;
        floatingMenu.setEnabled(true);
        if (appHeader != null) appHeader.setVisibility(View.GONE);
        if (sections != null) sections.setVisibility(View.GONE);
        readerBar.setVisibility(View.GONE); pageProgress.setVisibility(View.GONE); browserSlot.setPadding(0, 0, 0, 0);
        cover.setVisibility(View.GONE); floatingMenu.setVisibility(View.GONE); actions = new JSONArray();
        browserSlot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        browserSlot.removeAllViews();
        LinearLayout list = new LinearLayout(activity); list.setOrientation(LinearLayout.VERTICAL); list.setPadding(dp(24), dp(32), dp(24), dp(24));
        TextView brand = text("Genesis", 16); brand.setTypeface(null, Typeface.BOLD); list.addView(brand);
        TextView heading = text("Apps", 32); heading.setTypeface(null, Typeface.BOLD); heading.setPadding(0, dp(24), 0, dp(8));
        if (Build.VERSION.SDK_INT >= 28) heading.setAccessibilityHeading(true); list.addView(heading);
        TextView description = text("Your customized apps", 16); description.setPadding(0, 0, 0, dp(28)); list.addView(description);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject entry = entries.getJSONObject(i); JSONObject open = event("open");
            open.put("appletId", entry.getString("appletId")); open.put("sourceId", entry.getString("sourceId"));
            Button app = button(entry.getString("label"), () -> events.send(open));
            app.setTextSize(18); app.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
            app.setPadding(dp(20), dp(20), dp(20), dp(20)); app.setMinHeight(dp(88));
            GradientDrawable card = new GradientDrawable(); card.setColor(wash); card.setCornerRadius(dp(18));
            app.setBackgroundTintList(null); app.setBackground(new RippleDrawable(ColorStateList.valueOf(0x20808080), card, null));
            LinearLayout.LayoutParams row = new LinearLayout.LayoutParams(-1, -2); row.bottomMargin = dp(12); list.addView(app, row);
        }
        if (entries.length() == 0) list.addView(text("Your custom apps will appear here.", 16));
        ScrollView scroll = new ScrollView(activity); scroll.addView(list); browserSlot.addView(scroll);
    }

    void presentation(JSONObject command) throws JSONException {
        presentationState = command.getString("state"); presentationMessage = command.getString("message"); actions = command.getJSONArray("actions");
        boolean siteError = "siteError".equals(presentationState);
        boolean failed = "failed".equals(presentationState) || "unsupported".equals(presentationState);
        boolean loading = "loading".equals(presentationState);
        coverTitle.setText(siteError ? "Page unavailable" : failed ? "Couldn’t prepare this page" : ""); coverMessage.setText(siteError ? "Check your connection and try again." : failed ? "Try again, go back, or view the original page." : "");
        skeletonLoading(loading);
        recovery.setVisibility(failed ? View.VISIBLE : View.GONE);
        siteRecovery.setVisibility(siteError ? View.VISIBLE : View.GONE);
        boolean blocking = failed || siteError || loading;
        if (blocking) cover.setVisibility(View.VISIBLE);
        // Hide the underlying document from accessibility while a blocking notice is visible.
        browserSlot.setImportantForAccessibility(blocking ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        updateFloatingMenu();
    }
    void fullscreen(View view) {
        dismissMenu(); fullscreen = true; floatingMenu.setVisibility(View.GONE);
        content.addView(view, new FrameLayout.LayoutParams(-1, -1));
    }
    void exitFullscreen(View view) { content.removeView(view); fullscreen = false; updateFloatingMenu(); }
    void diagnostics(String value) {
        TextView body = text(value, 16); body.setTextIsSelectable(true); body.setPadding(dp(24), dp(16), dp(24), dp(16));
        ScrollView scroll = new ScrollView(activity); scroll.addView(body);
        new AlertDialog.Builder(activity).setTitle("Genesis debug inspector").setView(scroll).setPositiveButton("Close", null).show();
    }
    void error(String message) { new AlertDialog.Builder(activity).setTitle("Genesis").setMessage(message).setPositiveButton("Close", null).show(); }
    void dispose() { dismissMenu(); }
    void navigation(String url, boolean reader, boolean canBack, boolean canForward) {
        readerUrl = url;
        readerVisible = reader;
        readerBack.setEnabled(canBack); readerForward.setEnabled(canForward);
        if (reader) {
            Uri parsed = Uri.parse(url);
            readerOrigin.setText((parsed.getHost() == null ? "Web page" : parsed.getHost()) + (parsed.getPort() < 0 ? "" : ":" + parsed.getPort()));
        }
        readerBar.setVisibility(reader ? View.VISIBLE : View.GONE);
        boolean app = shell != null && !reader;
        if (appHeader != null) { appHeader.setVisibility(app ? View.VISIBLE : View.GONE); appBack.setVisibility(detailRoute ? View.VISIBLE : View.GONE); }
        if (sections != null) sections.setVisibility(app ? View.VISIBLE : View.GONE);
        if (app && choices != null) {
            JSONArray items = shell.optJSONArray("choices");
            boolean available = items != null && items.length() > 0;
            choices.setVisibility(available && !detailRoute && pageId.isEmpty() && sourceId.equals(shell.optJSONArray("sections").optJSONObject(0).optString("sourceId")) ? View.VISIBLE : View.GONE);
            choices.setText(available ? items.optJSONObject(0).optString("label") : "View");
            if (available) for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                Uri target = Uri.parse(item.optString("url")), current = Uri.parse(url == null ? "" : url);
                if (java.util.Objects.equals(target.getScheme(), current.getScheme()) && java.util.Objects.equals(target.getAuthority(), current.getAuthority()) && java.util.Objects.equals(target.getPath(), current.getPath())) choices.setText(item.optString("label"));
            }
            choices.setContentDescription("View: " + choices.getText() + ". Choose view");
        }
        alignContentInsets();
        readerBar.bringToFront(); pageProgress.bringToFront(); updateFloatingMenu();
    }
    private int sectionBarHeight() {
        return Math.max(dp(SECTION_BAR_HEIGHT), sections == null ? 0 : sections.getHeight());
    }
    private void alignContentInsets() {
        boolean app = appletActive && shell != null && !readerVisible;
        int top = app ? dp(APP_HEADER_HEIGHT) : readerVisible ? dp(READER_BAR_HEIGHT) : 0;
        int bottom = app ? sectionBarHeight() : 0;
        browserSlot.setPadding(0, top, 0, bottom);
        FrameLayout.LayoutParams bounds = (FrameLayout.LayoutParams) cover.getLayoutParams();
        if (bounds.topMargin != top || bounds.bottomMargin != bottom) {
            bounds.topMargin = top; bounds.bottomMargin = bottom; cover.setLayoutParams(bounds);
        }
    }
    private void alignHeaderInsets() {
        if (appHeader == null) return;
        int available = content.getWidth() - content.getPaddingLeft() - content.getPaddingRight();
        int gutter = available > 0 && available < dp(360) ? dp(12) : dp(16);
        // Align with the applet's centered 760dp reading column and 16dp page gutter.
        int inset = Math.max(gutter, (available - dp(760)) / 2);
        if (appHeader.getPaddingLeft() != inset) appHeader.setPadding(inset, 0, inset, 0);
    }
    private void updateFloatingMenu() {
        floatingMenu.setVisibility(!appletActive || fullscreen || readerVisible || shell != null ? View.GONE : View.VISIBLE);
        FrameLayout.LayoutParams bounds = (FrameLayout.LayoutParams) floatingMenu.getLayoutParams();
        int bottom = shell != null && !readerVisible ? sectionBarHeight() + dp(16) : dp(16);
        if (bounds.bottomMargin != bottom) { bounds.bottomMargin = bottom; floatingMenu.setLayoutParams(bounds); }
        floatingMenu.bringToFront();
    }
    void pageLoading(int progress) {
        pageProgress.setVisibility(progress >= 100 ? View.GONE : View.VISIBLE);
        pageProgress.setIndeterminate(progress <= 0);
        if (progress > 0) pageProgress.setProgress(progress);
    }
    private void skeletonLoading(boolean loading) {
        coverTitle.setVisibility(loading?View.GONE:View.VISIBLE);coverMessage.setVisibility(loading?View.GONE:View.VISIBLE);
        loadingSkeleton.setVisibility(loading?View.VISIBLE:View.GONE);
        boolean dark=(activity.getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK)==android.content.res.Configuration.UI_MODE_NIGHT_YES;
        int color=Color.parseColor(dark?"#303438":"#eceff1");
        for(int i=0;i<loadingSkeleton.getChildCount();i++) {
            LinearLayout row=(LinearLayout)loadingSkeleton.getChildAt(i);
            for(int j=0;j<row.getChildCount();j++){GradientDrawable shape=new GradientDrawable();shape.setColor(color);shape.setCornerRadius(dp(4));row.getChildAt(j).setBackground(shape);}
        }
    }
    void pageStarting() {
        browserSlot.animate().cancel(); browserSlot.setAlpha(1f); browserSlot.setTranslationY(0); browserSlot.setTranslationX(0);
        skeletonLoading(true);
        recovery.setVisibility(View.GONE);
        siteRecovery.setVisibility(View.GONE);
        cover.setVisibility(View.VISIBLE);
        browserSlot.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    void websiteFailure(String message) { pageLoading(100); error(message); }
    private void readerMenu() {
        PopupMenu popup = new PopupMenu(activity, readerBar, Gravity.END);
        popup.getMenu().add("Reload").setOnMenuItemClickListener(item -> { events.send(event("reload")); return true; });
        popup.getMenu().add("Copy link").setOnMenuItemClickListener(item -> { events.send(event("copyLink")); return true; });
        popup.getMenu().add("Share link").setOnMenuItemClickListener(item -> { events.send(event("shareLink")); return true; });
        popup.getMenu().add("Open in browser").setOnMenuItemClickListener(item -> { events.send(event("openBrowser")); return true; });
        popup.getMenu().add("Return to Genesis").setOnMenuItemClickListener(item -> { events.send(event("home")); return true; });
        popup.show();
    }
    private void dismissMenu() { if (activeMenu != null) { activeMenu.dismiss(); activeMenu = null; } }
    private void menu() {
        dismissMenu(); PopupMenu popup = new PopupMenu(activity, appOptions != null ? appOptions : floatingMenu, Gravity.END); activeMenu = popup;
        popup.setOnDismissListener(value -> { if (activeMenu == popup) activeMenu = null; });
        Menu menu = popup.getMenu();
        menu.add("Return to Genesis").setOnMenuItemClickListener(item -> { events.send(event("home")); return true; });
        menu.add("Back").setOnMenuItemClickListener(item -> { events.send(event("back")); return true; });
        menu.add("Reload").setOnMenuItemClickListener(item -> { events.send(event("reload")); return true; });
        if (actions.length() > 0) {
            SubMenu pages = menu.addSubMenu("App pages");
            for (int i = 0; i < actions.length(); i++) {
                JSONObject action = actions.optJSONObject(i);
                if (action != null) pages.add(action.optString("label")).setOnMenuItemClickListener(item -> {
                    JSONObject open = event("openPage");
                    try { open.put("pageId", action.getString("pageId")); events.send(open); }
                    catch (JSONException error) { error("Invalid package action"); }
                    return true;
                });
            }
        }
        menu.add("Service connections").setOnMenuItemClickListener(item -> { events.send(event("configureServices")); return true; });
        menu.add("Rendering").setOnMenuItemClickListener(item -> { events.send(event("renderingSettings")); return true; });
        SubMenu recoveryMenu = menu.addSubMenu("Recovery");
        recoveryMenu.add("Retry customization").setOnMenuItemClickListener(item -> { events.send(event("retry")); return true; });
        recoveryMenu.add("Open ordinary site").setOnMenuItemClickListener(item -> { events.send(event("ordinary")); return true; });
        if (!"ready".equals(presentationState)) recoveryMenu.add(presentationMessage).setEnabled(false);
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            SubMenu debugMenu = menu.addSubMenu("Developer tools");
            String[][] debug = {{"Inspect current document", "inspect"}, {"Qualify 20 reloads", "qualify"}, {"Simulate creator failure", "debugFailure"}, {"Terminate renderer", "debugTerminate"}};
            for (String[] item : debug) { if(isolatedApplet&&"qualify".equals(item[1]))continue; debugMenu.add(item[0]).setOnMenuItemClickListener(clicked -> { events.send(event(item[1])); return true; }); }
        }
        popup.show();
    }
    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private void styleChromeControl(View view, int fill, int radius) {
        view.setElevation(0); view.setStateListAnimator(null); view.setBackgroundTintList(null);
        GradientDrawable shape = new GradientDrawable(); shape.setColor(fill); shape.setCornerRadius(dp(radius));
        GradientDrawable mask = new GradientDrawable(); mask.setColor(Color.WHITE); mask.setCornerRadius(dp(radius));
        view.setBackground(new RippleDrawable(ColorStateList.valueOf((accent & 0x00ffffff) | 0x20000000), shape, mask));
    }
    private ImageButton iconButton(int resource, String label, Runnable action) {
        ImageButton button = new ImageButton(activity); button.setImageResource(resource);
        button.setContentDescription(label); button.setTooltipText(label); button.setPadding(dp(12), dp(12), dp(12), dp(12));
        button.setImageTintList(new ColorStateList(new int[][] {new int[] {-android.R.attr.state_enabled}, new int[] {}},
            new int[] {(ink & 0x00ffffff) | 0x60000000, ink}));
        styleChromeControl(button, Color.TRANSPARENT, 24); button.setOnClickListener(view -> action.run()); return button;
    }
    private TextView text(String value, int size) { TextView text = new TextView(activity); text.setText(value); text.setTextSize(size); text.setTextColor(ink); return text; }
    private Button button(String label, Runnable action) {
        Button button = new Button(activity); button.setText(label); button.setAllCaps(false); button.setTextSize(16);
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(dp(48)); button.setTextColor(ink);
        button.setBackgroundTintList(ColorStateList.valueOf(wash)); button.setOnClickListener(view -> action.run()); return button;
    }
    static JSONObject event(String type) {
        JSONObject event = new JSONObject();
        try { event.put("type", type); } catch (JSONException impossible) { throw new IllegalStateException(impossible); }
        return event;
    }
}
