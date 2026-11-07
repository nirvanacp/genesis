package app.nirvana.genesis;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
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
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * Applet-scoped HTTPS connections. Credentials stay in this Keystore-sealed store; the host only
 * names the applet and service. No website cookies, redirects, or applet-selected credentials.
 */
final class ServiceClient {
    private static final int BODY_MAX_BYTES = 262144;

    /** A finished request: an HTTP status and JSON body, or an error code the host understands. */
    private static final class Outcome {
        final int status;
        final Object body;
        final String code;
        final String message;

        Outcome(int status, Object body, String code, String message) {
            this.status = status;
            this.body = body;
            this.code = code;
            this.message = message;
        }

        static Outcome failed(String code, String message) { return new Outcome(0, null, code, message); }
    }

    private final Activity activity;
    private final Files files;
    private final Consumer<JSONObject> events;
    private final SharedPreferences settings;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(2, 2, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));
    private boolean closed;

    ServiceClient(Activity activity, Files files, Consumer<JSONObject> events) {
        this.activity = activity;
        this.files = files;
        this.events = events;
        settings = activity.getSharedPreferences("genesis-services", Context.MODE_PRIVATE);
    }

    private static String setting(String applet, String service) { return applet + "/" + service; }

    private boolean debuggable() { return (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }

    /** Executes a host `serviceRequest` and answers with `serviceResponse` or `serviceFailed`. */
    void request(JSONObject command) {
        long requestId = command.optLong("requestId");
        // Capture one configuration for this request; later edits affect future requests.
        String id = setting(command.optString("appletId"), command.optString("serviceId"));
        String origin = settings.getString(id + "/url", ""), sealed = settings.getString(id + "/token", "");
        String certificate = settings.getString(id + "/certificate", "");
        Object body = command.isNull("body") ? null : command.opt("body");
        String path = command.optString("path"), method = command.optString("method");
        try {
            worker.execute(() -> {
                Outcome outcome = execute(origin, sealed, certificate, path, method, body);
                main.post(() -> deliver(requestId, outcome));
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            deliver(requestId, Outcome.failed("QUOTA_EXCEEDED", "Service queue is full. Reread before retrying."));
        }
    }

    private void deliver(long requestId, Outcome outcome) {
        if (closed) return;
        try {
            JSONObject event = outcome.code == null
                ? Bridge.event("serviceResponse").put("requestId", requestId).put("status", outcome.status)
                    .put("body", outcome.body == null ? JSONObject.NULL : outcome.body)
                : Bridge.event("serviceFailed").put("requestId", requestId).put("code", outcome.code).put("message", outcome.message);
            events.accept(event);
        } catch (org.json.JSONException ignored) { /* The host's deadline answers the request. */ }
    }

    /**
     * Applies a debug-build `service-<appletId>-<serviceId>.json` import, then checks the service's
     * health path and writes `{ok, health}` to the receipt. Neither tokens nor certificates enter APK assets.
     */
    void importCredential(File file) {
        try {
            if (!debuggable()) throw new IllegalArgumentException("Service imports need a debug build");
            JSONObject envelope = new JSONObject(files.read(file, 32768));
            String applet = envelope.getString("appletId"), service = envelope.getString("serviceId");
            if (envelope.getInt("version") != 1 || !files.declaredServices(applet).contains(service)) {
                throw new IllegalArgumentException("The applet does not declare service " + service);
            }
            String origin = endpoint(envelope.getString("origin")).resolve("/").toString();
            String token = envelope.getString("token"), certificate = envelope.optString("certificate", "");
            if (token.length() < 32 || token.length() > 4096 || !token.matches("[\\x21-\\x7e]+")) throw new IllegalArgumentException("Invalid credential");
            if (!certificate.isEmpty()) tls(certificate); // Parse before replacing the configuration.
            String healthPath = envelope.getString("healthPath");
            if (!healthPath.matches("/[A-Za-z0-9/_-]+")) throw new IllegalArgumentException("Invalid service health path");
            String id = setting(applet, service);
            String sealed = encrypt(token);
            if (!settings.edit().putString(id + "/url", origin).putString(id + "/token", sealed).putString(id + "/certificate", certificate).commit()) {
                throw new IllegalStateException("Could not save the connection");
            }
            worker.execute(() -> {
                Outcome health = execute(origin, sealed, certificate, healthPath, "GET", null);
                JSONObject body = health.body instanceof JSONObject ? (JSONObject) health.body : null;
                boolean ready = health.code == null && health.status == 200 && body != null && body.optBoolean("ready");
                receipt(file, true, ready ? "ready" : "unavailable", null);
            });
        } catch (Exception error) {
            receipt(file, false, null, String.valueOf(error.getMessage()));
        } finally {
            if (!file.delete()) file.deleteOnExit();
        }
    }

    private void receipt(File source, boolean ok, String health, String error) {
        try {
            JSONObject receipt = new JSONObject().put("ok", ok);
            if (health != null) receipt.put("health", health);
            if (error != null) receipt.put("error", error);
            files.receipt(source, receipt);
        } catch (org.json.JSONException ignored) { /* The CLI times out instead. */ }
    }

    /** The connection dialog for an applet's declared services. */
    void configure(String applet, List<String> services) {
        if (services.isEmpty()) {
            new AlertDialog.Builder(activity).setMessage("This applet declares no service connections.").setPositiveButton("Close", null).show();
            return;
        }
        String[] ids = services.toArray(new String[0]);
        new AlertDialog.Builder(activity).setTitle("Service connections").setItems(ids, (dialog, index) -> edit(applet, ids[index])).show();
    }

    private void edit(String applet, String service) {
        String id = setting(applet, service);
        LinearLayout form = new LinearLayout(activity);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(48, 16, 48, 16);
        TextView description = new TextView(activity);
        description.setText("Allow this applet to send data to this server. Enter its HTTPS origin and backend token. A blank token keeps the current token only when the origin is unchanged.");
        form.addView(description);
        EditText url = new EditText(activity);
        url.setHint("https://your-server.example");
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(settings.getString(id + "/url", ""));
        form.addView(url);
        EditText token = new EditText(activity);
        token.setHint("Backend token");
        token.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(token);
        AlertDialog dialog = new AlertDialog.Builder(activity).setTitle(service).setView(form).setNegativeButton("Cancel", null)
            .setNeutralButton("Disconnect", (d, w) -> settings.edit().remove(id + "/url").remove(id + "/token").remove(id + "/certificate").apply())
            .setPositiveButton("Save", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                String origin = endpoint(url.getText().toString().trim()).resolve("/").toString();
                String raw = token.getText().toString();
                boolean sameOrigin = origin.equals(settings.getString(id + "/url", ""));
                if (raw.isEmpty() && !sameOrigin) throw new IllegalArgumentException("Enter a token for the new server.");
                if (!raw.isEmpty() && (raw.length() > 4096 || !raw.matches("[\\x21-\\x7e]+"))) throw new IllegalArgumentException("Token must contain printable ASCII characters.");
                String sealed = raw.isEmpty() ? settings.getString(id + "/token", "") : encrypt(raw);
                if (!settings.edit().putString(id + "/url", origin).putString(id + "/token", sealed).remove(id + "/certificate").commit()) {
                    throw new IllegalStateException("Could not save the connection");
                }
                dialog.dismiss();
            } catch (Exception error) { url.setError(error.getMessage()); }
        }));
        dialog.show();
    }

    /** Runs on the worker thread. */
    private Outcome execute(String origin, String sealed, String certificate, String path, String method, Object body) {
        if (origin.isEmpty() || sealed.isEmpty()) {
            return Outcome.failed("CONFIGURATION_REQUIRED", "This service is not connected. Set it up in the Genesis menu.");
        }
        HttpURLConnection connection = null;
        try {
            URI base = endpoint(origin), destination = base.resolve(path);
            if (!base.getScheme().equals(destination.getScheme()) || !base.getRawAuthority().equals(destination.getRawAuthority()) || destination.getUserInfo() != null) {
                throw new IllegalArgumentException("Service path changes origin");
            }
            connection = (HttpURLConnection) destination.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            if (!certificate.isEmpty() && debuggable()) ((javax.net.ssl.HttpsURLConnection) connection).setSSLSocketFactory(tls(certificate));
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Authorization", "Bearer " + decrypt(sealed));
            connection.setRequestProperty("Accept", "application/json");
            if (body != null) {
                String json = body instanceof String ? JSONObject.quote((String) body) : body.toString();
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > BODY_MAX_BYTES) throw new IllegalArgumentException("Service body exceeds 256 KiB");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) return Outcome.failed("AUTHENTICATION_FAILED", "The service rejected its credential.");
            if (status >= 300 && status < 400) throw new IllegalArgumentException("Service redirects are disabled");
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) throw new org.json.JSONException("Service returned no JSON body");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            try (InputStream input = stream) {
                byte[] buffer = new byte[8192];
                for (int count; (count = input.read(buffer)) != -1; ) {
                    bytes.write(buffer, 0, count);
                    if (bytes.size() > BODY_MAX_BYTES || System.nanoTime() > deadline) throw new IllegalArgumentException("Service response exceeds limits");
                }
            }
            return new Outcome(status, new org.json.JSONTokener(bytes.toString("UTF-8")).nextValue(), null, null);
        } catch (java.net.SocketTimeoutException error) {
            return Outcome.failed("DEADLINE", "The service did not answer in time. A write may have completed; reread before retrying.");
        } catch (javax.net.ssl.SSLException error) {
            return Outcome.failed("CERTIFICATE_FAILED", "The service certificate was not accepted.");
        } catch (org.json.JSONException | IllegalArgumentException error) {
            return Outcome.failed("SERVICE_FAILURE", "The service answered with something Genesis cannot use.");
        } catch (Exception error) {
            return Outcome.failed("SERVICE_UNREACHABLE", "The service could not be reached. A write may have completed; reread before retrying.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static URI endpoint(String text) throws Exception {
        URI uri = new URI(text);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
            || !(uri.getPath().isEmpty() || "/".equals(uri.getPath()))) {
            throw new IllegalArgumentException("Enter an HTTPS origin without a path, query, or credentials.");
        }
        return uri;
    }

    private static javax.net.ssl.SSLSocketFactory tls(String certificate) throws Exception {
        java.security.cert.CertificateFactory factory = java.security.cert.CertificateFactory.getInstance("X.509");
        java.security.cert.Certificate cert = factory.generateCertificate(new java.io.ByteArrayInputStream(certificate.getBytes(StandardCharsets.US_ASCII)));
        KeyStore trust = KeyStore.getInstance(KeyStore.getDefaultType());
        trust.load(null);
        trust.setCertificateEntry("service", cert);
        javax.net.ssl.TrustManagerFactory managers = javax.net.ssl.TrustManagerFactory.getInstance(javax.net.ssl.TrustManagerFactory.getDefaultAlgorithm());
        managers.init(trust);
        javax.net.ssl.SSLContext context = javax.net.ssl.SSLContext.getInstance("TLS");
        context.init(null, managers.getTrustManagers(), null);
        return context.getSocketFactory();
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias("genesis-service-key")) return (SecretKey) store.getKey("genesis-service-key", null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder("genesis-service-key", KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    private static String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    private static String decrypt(String value) throws Exception {
        String[] parts = value.split(":");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    void close() {
        closed = true;
        worker.shutdownNow();
    }
}
