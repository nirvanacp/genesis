package app.nirvana.genesis.ui;

import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import com.google.android.material.button.MaterialButton;

/** "Create a new applet" from an opened link: the user describes the applet they want for its website. */
public final class CreateApplet {
    public static final String TAG = "create-applet";

    private CreateApplet() {}

    public static View page(Ui ui, String url) {
        Tokens t = ui.tokens;
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(24));
        content.addView(ui.paragraph("Describe the applet you want for " + url + ": the screens, the data it keeps and what it does for you.",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        EditText field = new EditText(ui.activity);
        field.setHint("What should this applet do?");
        field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        field.setMinLines(4);
        field.setGravity(Gravity.TOP | Gravity.START);
        t.style(field, Tokens.Type.BODY_LARGE, t.onSurface);
        field.setHintTextColor(t.onSurfaceVariant);
        field.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(14));
        field.setBackground(t.outlined(t.surface, t.outline, 12, false));
        field.setContentDescription("Applet description");
        content.addView(field, t.margins(20, 8));
        MaterialButton create = t.button("Create applet");
        // TODO: build the applet from the description. Until the builder exists the button does nothing.
        create.setOnClickListener(v -> {});
        return ui.page(t.header("Create a new applet", false, () -> ui.pages.remove(TAG)), content, ui.footer(create));
    }
}
