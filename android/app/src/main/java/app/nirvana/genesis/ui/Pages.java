package app.nirvana.genesis.ui;

import android.content.Context;
import android.view.View;
import android.widget.FrameLayout;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * The stack of full-screen management pages over the launcher and the applet. Only the top page
 * is shown. A live page is rebuilt when the host sends new launcher data, so it stays current.
 */
public final class Pages {
    private static final class Entry {
        final String tag;
        final Supplier<View> build;
        final Runnable back;
        final boolean live;
        View view;

        Entry(String tag, Supplier<View> build, Runnable back, boolean live) {
            this.tag = tag;
            this.build = build;
            this.back = back;
            this.live = live;
        }
    }

    public final FrameLayout root;
    private final List<Entry> stack = new ArrayList<>();

    Pages(Context context) {
        root = new FrameLayout(context);
        root.setVisibility(View.GONE);
    }

    /**
     * Shows a page on top. A page with the same tag is replaced in place. `back` runs on system
     * Back or the header's Back; null pops the page.
     */
    public void push(String tag, Supplier<View> build, Runnable back, boolean live) {
        Entry entry = new Entry(tag, build, back, live);
        int existing = index(tag);
        if (existing >= 0) {
            root.removeView(stack.get(existing).view);
            stack.remove(existing);
        }
        entry.view = build.get();
        stack.add(entry);
        root.addView(entry.view, new FrameLayout.LayoutParams(-1, -1));
        show();
    }

    public void pop() {
        if (stack.isEmpty()) return;
        Entry top = stack.remove(stack.size() - 1);
        root.removeView(top.view);
        show();
    }

    public void remove(String tag) {
        int index = index(tag);
        if (index < 0) return;
        root.removeView(stack.get(index).view);
        stack.remove(index);
        show();
    }

    /** Removes every page whose tag starts with `prefix`. */
    public void removePrefix(String prefix) {
        for (int i = stack.size() - 1; i >= 0; i--) {
            if (stack.get(i).tag.startsWith(prefix)) {
                root.removeView(stack.get(i).view);
                stack.remove(i);
            }
        }
        show();
    }

    public String top() { return stack.isEmpty() ? null : stack.get(stack.size() - 1).tag; }

    public boolean has(String tag) { return index(tag) >= 0; }

    public boolean isEmpty() { return stack.isEmpty(); }

    /** System Back: runs the top page's back action. Returns false when no page is open. */
    public boolean back() {
        if (stack.isEmpty()) return false;
        Entry top = stack.get(stack.size() - 1);
        if (top.back != null) top.back.run();
        else pop();
        return true;
    }

    /** Rebuilds every live page from current data; a live page whose build returns null is closed. */
    public void refresh() {
        for (Entry entry : new ArrayList<>(stack)) {
            if (!entry.live) continue;
            View fresh = entry.build.get();
            if (fresh == null) {
                root.removeView(entry.view);
                stack.remove(entry);
                continue;
            }
            int at = root.indexOfChild(entry.view);
            root.removeView(entry.view);
            entry.view = fresh;
            root.addView(fresh, at < 0 ? root.getChildCount() : at, new FrameLayout.LayoutParams(-1, -1));
        }
        show();
    }

    /** Rebuilds every page, live or not, for a theme change. */
    public void rebuildAll() {
        root.removeAllViews();
        for (Entry entry : stack) {
            entry.view = entry.build.get();
            root.addView(entry.view, new FrameLayout.LayoutParams(-1, -1));
        }
        show();
    }

    public void clear() {
        stack.clear();
        root.removeAllViews();
        show();
    }

    private int index(String tag) {
        for (int i = 0; i < stack.size(); i++) if (stack.get(i).tag.equals(tag)) return i;
        return -1;
    }

    private void show() {
        for (int i = 0; i < stack.size(); i++) stack.get(i).view.setVisibility(i == stack.size() - 1 ? View.VISIBLE : View.GONE);
        root.setVisibility(stack.isEmpty() ? View.GONE : View.VISIBLE);
        // A screen reader reads only the top page, not Home or the applet under it.
        if (!(root.getParent() instanceof android.view.ViewGroup)) return;
        android.view.ViewGroup parent = (android.view.ViewGroup) root.getParent();
        int below = stack.isEmpty() ? View.IMPORTANT_FOR_ACCESSIBILITY_AUTO : View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS;
        for (int i = 0; i < parent.getChildCount(); i++) {
            View child = parent.getChildAt(i);
            if (child == root) break;
            child.setImportantForAccessibility(below);
        }
    }
}
