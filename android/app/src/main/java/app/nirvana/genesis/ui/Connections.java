package app.nirvana.genesis.ui;

import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import app.nirvana.genesis.R;
import com.google.android.material.button.MaterialButton;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/** Service connections of one applet: each declared service's address and token. */
public final class Connections {
    static final String TAG = "connections:";

    /** One service's stored connection. */
    public static final class Status {
        public final boolean connected;
        public final String address;
        /** A label for the last failed request in this session, or null. */
        public final String failure;

        public Status(boolean connected, String address, String failure) {
            this.connected = connected;
            this.address = address;
            this.failure = failure;
        }
    }

    /** Where connections are kept: the shell's Keystore-sealed service store. */
    public interface Store {
        Status status(String appletId, String serviceId);
        /** Saves a connection; a blank token keeps the stored one for the same address. Returns an error or null. */
        String save(String appletId, String serviceId, String address, String token);
        void disconnect(String appletId, String serviceId);
    }

    private final Ui ui;
    /** The services whose form is open, by "applet/service". */
    private final Map<String, String> editing = new HashMap<>();

    public Connections(Ui ui) { this.ui = ui; }

    public void open(String appletId) {
        editing.clear();
        ui.pages.push(TAG + appletId, () -> page(appletId), null, true);
    }

    private void rebuild(String appletId) {
        ui.pages.push(TAG + appletId, () -> page(appletId), null, true);
    }

    private View page(String appletId) {
        Tokens t = ui.tokens;
        JSONObject entry = ui.entry(appletId);
        if (entry == null) return null;
        String name = entry.optString("name");
        List<String> services = Ui.strings(entry.optJSONArray("services"));
        LinearLayout content = ui.column();
        content.setPadding(0, t.dp(8), 0, t.dp(32));
        content.addView(ui.paragraph(name + " sends some data to servers its developer runs. Each one needs its address and a token from the developer. Genesis keeps the token sealed on this phone.",
            Tokens.Type.BODY_LARGE, t.onSurfaceVariant));
        if (services.isEmpty()) content.addView(ui.paragraph(name + " uses no outside services.", Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        Store store = ui.actions.connections();
        for (String service : services) content.addView(card(appletId, service, store), t.margins(20, 16));
        return ui.page(t.header("Service connections", false, () -> ui.pages.remove(TAG + appletId)), content, null);
    }

    private View card(String appletId, String service, Store store) {
        Tokens t = ui.tokens;
        Status status = store.status(appletId, service);
        String key = appletId + "/" + service;
        boolean form = !status.connected || editing.containsKey(key);
        LinearLayout card = ui.column();
        card.setPadding(t.dp(16), t.dp(14), t.dp(16), t.dp(16));
        card.setBackground(t.outlined(t.surface, t.outlineVariant, 16, false));
        LinearLayout top = new LinearLayout(ui.activity);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.addView(t.circleIcon(R.drawable.ic_services, t.secondaryContainer, t.onSecondaryContainer, 40), new LinearLayout.LayoutParams(t.dp(40), t.dp(40)));
        LinearLayout text = ui.column();
        text.addView(t.text(service, Tokens.Type.TITLE_MEDIUM, t.onSurface));
        if (status.connected) text.addView(t.text(Ui.host(status.address), Tokens.Type.BODY_MEDIUM, t.onSurfaceVariant));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(0, -2, 1);
        layout.setMarginStart(t.dp(12));
        top.addView(text, layout);
        top.addView(status.failure != null ? t.chip("Last request failed", Tokens.Chip.DANGER)
            : status.connected ? t.chip("Connected", Tokens.Chip.SUCCESS) : t.chip("Not connected", Tokens.Chip.NEUTRAL));
        card.addView(top);
        if (status.failure != null) {
            card.addView(t.banner(R.drawable.ic_warning, null, status.failure, t.errorContainer, t.onErrorContainer, 0), t.margins(0, 12));
        }

        if (!form) {
            LinearLayout buttons = new LinearLayout(ui.activity);
            buttons.setPadding(0, t.dp(14), 0, 0);
            MaterialButton change = t.smallButton("Change", false);
            change.setOnClickListener(v -> {
                editing.put(key, status.address);
                rebuild(appletId);
            });
            buttons.addView(change);
            MaterialButton disconnect = t.smallButton("Disconnect", false);
            disconnect.setTextColor(t.danger);
            disconnect.setOnClickListener(v -> {
                store.disconnect(appletId, service);
                editing.remove(key);
                rebuild(appletId);
            });
            LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(-2, -2);
            second.setMarginStart(t.dp(8));
            buttons.addView(disconnect, second);
            card.addView(buttons);
            return card;
        }

        card.addView(t.text("Address", Tokens.Type.LABEL_LARGE, t.onSurface), t.margins(0, 16));
        EditText address = field("https://your-server.example", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setText(status.connected ? status.address : "");
        address.setContentDescription(service + " address");
        card.addView(address, t.margins(0, 6));
        card.addView(t.text("Token", Tokens.Type.LABEL_LARGE, t.onSurface), t.margins(0, 12));
        EditText token = field(status.connected ? "Leave blank to keep the current token" : "Token from the developer",
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setContentDescription(service + " token");
        card.addView(token, t.margins(0, 6));
        TextView error = t.text("", Tokens.Type.BODY_SMALL, t.danger);
        error.setVisibility(View.GONE);
        card.addView(error, t.margins(0, 8));
        LinearLayout buttons = new LinearLayout(ui.activity);
        buttons.setPadding(0, t.dp(14), 0, 0);
        MaterialButton connect = t.smallButton(status.connected ? "Save" : "Connect", true);
        connect.setOnClickListener(v -> {
            String failure = store.save(appletId, service, address.getText().toString().trim(), token.getText().toString());
            if (failure != null) {
                error.setText(failure);
                error.setVisibility(View.VISIBLE);
                return;
            }
            editing.remove(key);
            rebuild(appletId);
        });
        buttons.addView(connect);
        if (status.connected) {
            MaterialButton cancel = t.smallButton("Cancel", false);
            cancel.setOnClickListener(v -> {
                editing.remove(key);
                rebuild(appletId);
            });
            LinearLayout.LayoutParams second = new LinearLayout.LayoutParams(-2, -2);
            second.setMarginStart(t.dp(8));
            buttons.addView(cancel, second);
        }
        card.addView(buttons);
        return card;
    }

    private EditText field(String hint, int inputType) {
        Tokens t = ui.tokens;
        EditText field = new EditText(ui.activity);
        field.setHint(hint);
        field.setSingleLine(true);
        field.setInputType(inputType);
        t.style(field, Tokens.Type.BODY_LARGE, t.onSurface);
        field.setHintTextColor(t.onSurfaceVariant);
        field.setPadding(t.dp(14), t.dp(12), t.dp(14), t.dp(12));
        field.setBackground(t.outlined(t.surface, t.outline, 12, false));
        return field;
    }
}
