package app.nirvana.genesis;

import android.content.Context;
import android.graphics.Color;
import android.os.Looper;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.LinkedHashMap;
import java.util.Map;

/** Native isolation for API 3. Document authority remains the host's responsibility. */
final class AppletPresentation extends FrameLayout {
    /** Blocks virtual source nodes even if WebView changes importance after loading. */
    static final class SourceView extends WebView {
        private boolean exposed;
        SourceView(Context context) { super(context); }
        void expose(boolean value) { exposed=value; setImportantForAccessibility(value?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS); }
        @Override public android.view.accessibility.AccessibilityNodeProvider getAccessibilityNodeProvider() { return exposed?super.getAccessibilityNodeProvider():null; }
        @Override public void onInitializeAccessibilityNodeInfo(android.view.accessibility.AccessibilityNodeInfo info) {
            if(exposed) super.onInitializeAccessibilityNodeInfo(info);
            else { info.setClassName(View.class.getName()); info.setVisibleToUser(false); info.setFocusable(false); }
        }
        @Override public boolean onCheckIsTextEditor() { return exposed&&super.onCheckIsTextEditor(); }
        @Override public boolean requestFocus(int direction, android.graphics.Rect rect) { return exposed&&super.requestFocus(direction,rect); }
    }
    private final FrameLayout sources, foreground, website;
    private final View barrier;
    private final Map<String, WebView> sourceViews = new LinkedHashMap<>();
    private WebView foregroundView, websiteView;
    private String adoptedSource;
    private long epoch;
    private boolean disposed, foregroundPrepared;

    AppletPresentation(Context context) {
        super(context);
        setBackgroundColor(Color.WHITE);
        sources = new FrameLayout(context) {
            @Override public boolean dispatchTouchEvent(MotionEvent event) { return true; }
            @Override public boolean requestFocus(int direction, android.graphics.Rect rect) { return false; }
        };
        sources.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        sources.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        barrier = new View(context);
        barrier.setBackgroundColor(Color.WHITE);
        barrier.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        barrier.setClickable(true);
        foreground = new FrameLayout(context);
        website = new FrameLayout(context);
        addView(sources, fullSize()); addView(barrier, fullSize());
        addView(foreground, fullSize()); addView(website, fullSize());
        website.setVisibility(View.GONE);
    }

    static boolean supported() { return WebViewFeature.isFeatureSupported(WebViewFeature.MUTE_AUDIO); }
    void setBackingColor(int color) {
        active(); int opaque = color | 0xff000000;
        barrier.setBackgroundColor(opaque); setBackgroundColor(opaque);
    }
    void setForeground(WebView view) {
        active();
        if (foregroundView != null || view.getParent() != null || sourceViews.containsValue(view) || view == websiteView)
            throw new IllegalStateException("Foreground already assigned or view already owned");
        foregroundView = view; view.setVisibility(View.INVISIBLE); foreground.addView(view, fullSize());
    }
    long beginForegroundTransition() {
        active(); epoch++; foregroundPrepared = false;
        if (foregroundView != null) foregroundView.setVisibility(View.INVISIBLE);
        return epoch;
    }
    void revealForeground(long expectedEpoch) {
        active(); WebView expected = foregroundView;
        if (expected == null || expectedEpoch != epoch || websiteView != null) return;
        foregroundPrepared = true;
        expected.postVisualStateCallback(expectedEpoch, new WebView.VisualStateCallback() {
            @Override public void onComplete(long requestId) {
                if (!disposed && expectedEpoch == epoch && foregroundView == expected && websiteView == null)
                    expected.setVisibility(View.VISIBLE);
            }
        });
    }
    void addSource(String sessionId, WebView view) {
        active();
        if (!supported()) throw new UnsupportedOperationException("WebView cannot mute hidden source audio");
        if (sessionId == null || sessionId.isEmpty() || sourceViews.containsKey(sessionId) || sourceViews.size() >= 2
                || view.getParent() != null || view == foregroundView || view == websiteView)
            throw new IllegalStateException("Invalid source ownership or view budget exceeded");
        hideSource(view); sourceViews.put(sessionId, view); sources.addView(view, fullSize());
    }
    /** Caller must revoke the source broker binding before making it visible. */
    void adoptSource(String sessionId) {
        active();
        if (websiteView != null) throw new IllegalStateException("Close the existing website first");
        WebView view = sourceViews.get(sessionId);
        if (view == null) throw new IllegalArgumentException("Unknown source session");
        epoch++; sources.removeView(view); adoptedSource = sessionId; showWebsite(view);
    }
    void openExternal(WebView view) {
        active();
        if (websiteView != null || view.getParent() != null || view == foregroundView || sourceViews.containsValue(view))
            throw new IllegalStateException("Invalid website ownership or view budget exceeded");
        epoch++; showWebsite(view);
    }
    /** Returns an independent reader for the host to destroy; adopted sources stay owned. */
    WebView closeWebsite() {
        active();
        if (websiteView == null) return null;
        epoch++; WebView view = websiteView;
        if (adoptedSource != null) hideSource(view);
        website.removeView(view); websiteView = null; website.setVisibility(View.GONE);
        foreground.setVisibility(View.VISIBLE);
        if (foregroundPrepared) revealForeground(epoch);
        if (adoptedSource != null) {
            sources.addView(view, fullSize()); adoptedSource = null; return null;
        }
        view.clearFocus(); view.onPause(); return view;
    }
    void removeSource(String sessionId) {
        active();
        if (sessionId == null) throw new IllegalArgumentException("Source session required");
        if (sessionId.equals(adoptedSource)) throw new IllegalStateException("Cannot evict the open website session");
        WebView view = sourceViews.remove(sessionId);
        if (view != null) { sources.removeView(view); view.onPause(); }
    }
    void foregroundFailed() {
        active(); epoch++; foregroundPrepared = false;
        if (foregroundView != null) { foreground.removeView(foregroundView); foregroundView = null; }
    }
    void dispose() {
        active(); disposed = true; epoch++; removeAllViews(); sourceViews.clear();
        foregroundView = null; websiteView = null; adoptedSource = null;
        // Host destroys views and revokes bindings independently.
    }
    private void showWebsite(WebView view) {
        websiteView = view; foreground.setVisibility(View.GONE);
        if(view instanceof SourceView) ((SourceView)view).expose(true);
        website.addView(view, fullSize()); website.setVisibility(View.VISIBLE);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        view.setFocusable(true); view.setFocusableInTouchMode(true); view.setVisibility(View.VISIBLE);
        if (supported()) WebViewCompat.setAudioMuted(view, false);
        view.onResume(); view.requestFocus();
    }
    private void hideSource(WebView view) {
        if(view instanceof SourceView) ((SourceView)view).expose(false);
        WebViewCompat.setAudioMuted(view, true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(true);
        view.clearFocus(); view.setFocusable(false); view.setFocusableInTouchMode(false);
        view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        view.setVisibility(View.VISIBLE);
    }
    private void active() {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("UI thread required");
        if (disposed) throw new IllegalStateException("Presentation disposed");
    }
    private static FrameLayout.LayoutParams fullSize() { return new FrameLayout.LayoutParams(-1, -1); }
}
