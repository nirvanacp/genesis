package app.nirvana.genesis.ui;

import android.content.Context;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.bottomsheet.BottomSheetBehavior;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.bottomsheet.BottomSheetDragHandleView;

/**
 * The Genesis menu, a bottom sheet over the applet. While a website is revealed, "View website"
 * gives way to the actions for that page: open it in the browser or copy its link. On the
 * launcher it offers adding an applet and checking for updates.
 */
public final class GenesisMenu {
    public enum Action { HOME, RELOAD, VIEW_WEBSITE, OPEN_IN_BROWSER, COPY_LINK, SERVICES, INFO, ADD_APPLET, CHECK_UPDATES }

    public interface Listener { void onMenuAction(Action action); }

    private GenesisMenu() {}

    public static void show(Context context, Tokens tokens, String name, String host, boolean websiteRevealed, Listener listener) {
        BottomSheetDialog dialog = new BottomSheetDialog(context);
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(0, 0, 0, tokens.dp(16));
        column.addView(new BottomSheetDragHandleView(context));

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(tokens.dp(24), 0, tokens.dp(24), tokens.dp(8));
        TextView title = tokens.text(name, Tokens.Type.TITLE_LARGE, tokens.onSurface);
        title.setAccessibilityHeading(true);
        header.addView(title);
        header.addView(tokens.text(host, Tokens.Type.BODY_MEDIUM, tokens.onSurfaceVariant));
        column.addView(header);

        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_home, "Home", Action.HOME));
        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_reload, "Reload applet", Action.RELOAD));
        if (websiteRevealed) {
            column.addView(row(context, tokens, dialog, listener, R.drawable.ic_open_in_browser, "Open in browser", Action.OPEN_IN_BROWSER));
            column.addView(row(context, tokens, dialog, listener, R.drawable.ic_link, "Copy link", Action.COPY_LINK));
        } else {
            column.addView(row(context, tokens, dialog, listener, R.drawable.ic_website, "View website", Action.VIEW_WEBSITE));
        }
        View divider = new View(context);
        divider.setBackgroundColor(tokens.outlineVariant);
        LinearLayout.LayoutParams dividerLayout = new LinearLayout.LayoutParams(-1, Math.max(1, tokens.dp(1)));
        dividerLayout.setMargins(tokens.dp(24), tokens.dp(8), tokens.dp(24), tokens.dp(8));
        column.addView(divider, dividerLayout);
        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_services, "Service connections", Action.SERVICES));
        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_info, "Applet info", Action.INFO));

        ScrollView scroll = new ScrollView(context);
        scroll.addView(column);
        dialog.setContentView(scroll);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.show();
    }

    public static void showLauncher(Context context, Tokens tokens, Listener listener) {
        BottomSheetDialog dialog = new BottomSheetDialog(context);
        LinearLayout column = new LinearLayout(context);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(0, 0, 0, tokens.dp(16));
        column.addView(new BottomSheetDragHandleView(context));
        TextView title = tokens.text("Genesis", Tokens.Type.TITLE_LARGE, tokens.onSurface);
        title.setAccessibilityHeading(true);
        title.setPadding(tokens.dp(24), 0, tokens.dp(24), tokens.dp(8));
        column.addView(title);
        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_add, "Add applet", Action.ADD_APPLET));
        column.addView(row(context, tokens, dialog, listener, R.drawable.ic_reload, "Check for updates", Action.CHECK_UPDATES));
        ScrollView scroll = new ScrollView(context);
        scroll.addView(column);
        dialog.setContentView(scroll);
        BottomSheetBehavior<?> behavior = dialog.getBehavior();
        behavior.setSkipCollapsed(true);
        behavior.setState(BottomSheetBehavior.STATE_EXPANDED);
        dialog.show();
    }

    private static View row(Context context, Tokens tokens, BottomSheetDialog dialog, Listener listener, int icon, String label, Action action) {
        LinearLayout row = new LinearLayout(context);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setMinimumHeight(tokens.dp(56));
        row.setPadding(tokens.dp(24), tokens.dp(8), tokens.dp(24), tokens.dp(8));
        row.setBackground(tokens.pressable(Color.TRANSPARENT, 0, 0));
        row.setClickable(true);
        row.setFocusable(true);
        row.setContentDescription(label);
        row.addView(tokens.icon(icon, tokens.onSurfaceVariant), new LinearLayout.LayoutParams(tokens.dp(24), tokens.dp(24)));
        TextView text = tokens.text(label, Tokens.Type.BODY_LARGE, tokens.onSurface);
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(tokens.dp(16));
        row.addView(text, layout);
        row.setOnClickListener(v -> {
            dialog.dismiss();
            listener.onMenuAction(action);
        });
        return row;
    }
}
