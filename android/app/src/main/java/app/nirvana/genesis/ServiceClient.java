package app.nirvana.genesis;

import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.text.InputType;
import android.util.Base64;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URI;
import java.security.KeyStore;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

/** Applet-scoped connections. No website cookies, redirects, or applet-selected credentials. */
final class ServiceClient {
    private final WeakReference<MainActivity> activity;
    private final SharedPreferences settings;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));
    ServiceClient(MainActivity owner) { activity = new WeakReference<>(owner); settings = owner.getSharedPreferences("genesis-services", Context.MODE_PRIVATE); }
    private String setting(String applet, String service) { return applet + "/" + service; }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias("genesis-service-key")) return (SecretKey) store.getKey("genesis-service-key", null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder("genesis-service-key", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }
    private String decrypt(String value) throws Exception {
        String[] parts = value.split(":"); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8);
    }
    private URI endpoint(String text) throws Exception {
        URI uri = new URI(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) throw new IllegalArgumentException("Enter an HTTPS origin without a path, query, or credentials.");
        return uri;
    }
    void configure(JSONObject command) throws Exception {
        MainActivity owner = activity.get(); if (owner == null) return;
        JSONArray services = command.getJSONArray("services");
        if (services.length() == 0) { new AlertDialog.Builder(owner).setMessage("This applet declares no service connections.").setPositiveButton("Close", null).show(); return; }
        String[] ids = new String[services.length()]; for (int i=0; i<ids.length; i++) ids[i]=services.getString(i);
        String applet = command.getString("appletId");
        new AlertDialog.Builder(owner).setTitle("Service connections: " + applet).setItems(ids, (dialog, index) -> edit(applet, ids[index])).show();
    }
    private void edit(String applet, String service) {
        MainActivity owner = activity.get(); if (owner == null) return;
        String id = setting(applet, service);
        LinearLayout form = new LinearLayout(owner); form.setOrientation(LinearLayout.VERTICAL); form.setPadding(24,16,24,16);
        TextView description = new TextView(owner); description.setText("Allow this applet to send data to this server. Enter its HTTPS origin and backend token. Reload after saving. A blank token keeps the current token only when the origin is unchanged."); form.addView(description);
        EditText url = new EditText(owner); url.setHint("https://your-server.example"); url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI); url.setText(settings.getString(id + "/url", "")); form.addView(url);
        EditText token = new EditText(owner); token.setHint("Backend token"); token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD); form.addView(token);
        AlertDialog dialog = new AlertDialog.Builder(owner).setTitle(service).setView(form).setNegativeButton("Cancel", null)
            .setNeutralButton("Disconnect", (d,w) -> settings.edit().remove(id+"/url").remove(id+"/token").apply()).setPositiveButton("Save", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                String origin = endpoint(url.getText().toString().trim()).resolve("/").toString();
                String raw = token.getText().toString();
                if (!raw.isEmpty() && (raw.length() > 4096 || !raw.matches("[\\x21-\\x7e]+"))) throw new IllegalArgumentException("Token must contain printable ASCII characters.");
                String sealed = raw.isEmpty() && origin.equals(settings.getString(id+"/url", "")) ? settings.getString(id+"/token", "") : encrypt(raw);
                if (raw.isEmpty() && !origin.equals(settings.getString(id+"/url", ""))) throw new IllegalArgumentException("Enter a token for the new server.");
                if (!settings.edit().putString(id+"/url", origin).putString(id+"/token", sealed).commit()) throw new IllegalStateException("Could not save connection");
                dialog.dismiss();
            } catch (Exception error) { url.setError(error.getMessage()); }
        })); dialog.show();
    }
    void request(JSONObject job) {
        // Capture one configuration for this operation; later edits affect future requests.
        String id = setting(job.optString("appletId"), job.optString("serviceId"));
        String origin = settings.getString(id+"/url", ""), sealed = settings.getString(id+"/token", "");
        try { worker.execute(() -> execute(job, origin, sealed)); }
        catch (java.util.concurrent.RejectedExecutionException error) { complete(job, null, "BUSY", "Service queue is full. Reread before retrying."); }
    }
    private void execute(JSONObject job, String origin, String sealed) {
        HttpURLConnection connection = null;
        try {
            if (origin.isEmpty() || sealed.isEmpty()) { complete(job, null, "CONFIGURATION_REQUIRED", "Open native Menu > Service connections, configure the backend, then reload."); return; }
            URI base = endpoint(origin), destination = base.resolve(job.getString("path"));
            if (!base.getScheme().equals(destination.getScheme()) || !base.getRawAuthority().equals(destination.getRawAuthority()) || destination.getUserInfo() != null) throw new IllegalArgumentException("Service path changes origin");
            connection = (HttpURLConnection) destination.toURL().openConnection(); connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(3000); connection.setReadTimeout(3000); connection.setRequestMethod(job.getString("method"));
            connection.setRequestProperty("Authorization", "Bearer " + decrypt(sealed)); connection.setRequestProperty("Accept", "application/json");
            if (!job.isNull("body")) {
                byte[] body = job.get("body").toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                if (body.length > 262144) throw new IllegalArgumentException("Service body exceeds 256 KiB");
                connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json"); connection.setFixedLengthStreamingMode(body.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalArgumentException("Service redirects are disabled");
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new IllegalStateException("Service returned no JSON body");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            try (InputStream input = stream) { byte[] buffer = new byte[8192]; int count;
                while ((count=input.read(buffer))!=-1) { bytes.write(buffer,0,count); if (bytes.size()>262144 || System.nanoTime()>deadline) throw new IllegalArgumentException("Service response exceeds limits"); }
            }
            Object body = new org.json.JSONTokener(bytes.toString("UTF-8")).nextValue();
            complete(job, new JSONObject().put("status", status).put("body", body), null, null);
        } catch (Exception error) { complete(job, null, "SERVICE_FAILURE", "Service request failed. A write may have completed; reread before retrying."); }
        finally { if (connection != null) connection.disconnect(); }
    }
    private void complete(JSONObject job, JSONObject result, String code, String message) {
        try {
            JSONObject reply = new JSONObject().put("v",1).put("documentId",job.getString("documentId")).put("requestId",job.getString("requestId")).put("ok",code==null);
            if (code==null) reply.put("result",result); else reply.put("error",new JSONObject().put("code",code).put("message",message).put("retryable",false));
            JSONObject completion = new JSONObject().put("generation",job.getLong("generation")).put("documentId",job.getString("documentId")).put("channel",job.getLong("channel")).put("response",reply);
            JSONObject event = HostViews.event("serviceCompleted"); event.put("completion",completion);
            main.post(() -> { MainActivity owner=activity.get(); if (owner!=null && !owner.isDestroyed()) owner.send(event); });
        } catch (org.json.JSONException ignored) { /* Host-produced job was malformed. */ }
    }
    void close() { worker.shutdownNow(); activity.clear(); }
}
