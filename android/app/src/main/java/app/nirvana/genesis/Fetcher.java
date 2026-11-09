package app.nirvana.genesis;

import android.app.Activity;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * HTTPS GETs for the host's applet flows. The host builds every URL; this class fetches only
 * HTTPS URLs on hosts that both the command and {@link #FETCH_HOSTS} allow, follows redirects
 * itself under the same rule, and reports one `fetchCompleted` per command on the UI thread.
 */
final class Fetcher {
    /** Equal to `FETCH_HOSTS` in `crates/contracts`; the shell never fetches a host the host did not allow. */
    static final List<String> FETCH_HOSTS = Arrays.asList(
        "api.github.com",
        "github.com",
        "raw.githubusercontent.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com");
    static final String FETCH_DIRECTORY = "genesis-fetch";
    private static final int MAX_REDIRECTS = 5;
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final String TAG = "GenesisFetch";

    /** A finished request, as the fields of `fetchCompleted`. */
    private static final class Result {
        int status;
        String error, etag, finalUrl, body, path;
        Integer rateRemaining;
        Long rateReset;
    }

    private final Consumer<JSONObject> events;
    private final File directory;
    private final String userAgent;
    private final boolean debuggable;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean closed;

    Fetcher(Activity activity, Consumer<JSONObject> events) {
        this.events = events;
        directory = new File(activity.getFilesDir(), FETCH_DIRECTORY);
        debuggable = (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        String version;
        try { version = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException error) { version = "unknown"; }
        userAgent = "Genesis/" + version;
    }

    /** The folder for downloads and for files the user picks, which the host reads from. */
    File directory() { return directory; }

    /** Runs a host `fetch` command in the background, in order with the earlier ones. */
    void fetch(JSONObject command) throws JSONException {
        String requestId = command.getString("requestId");
        String url = command.getString("url");
        long maxBytes = command.getLong("maxBytes");
        String etag = command.isNull("etag") ? null : command.optString("etag", null);
        String toFile = command.isNull("toFile") ? null : command.optString("toFile", null);
        Set<String> hosts = new HashSet<>();
        JSONArray allowed = command.getJSONArray("hosts");
        for (int i = 0; i < allowed.length(); i++) if (FETCH_HOSTS.contains(allowed.getString(i))) hosts.add(allowed.getString(i));
        File target = toFile == null ? null : new File(toFile);
        boolean inside = target == null || directory.equals(target.getParentFile());
        worker.execute(() -> {
            Result result = inside ? run(url, maxBytes, etag, target, hosts) : refused("Genesis writes downloads only to its own folder");
            if (debuggable) Log.d(TAG, requestId + " " + result.status + (result.error == null ? "" : " " + result.error));
            main.post(() -> deliver(requestId, result));
        });
    }

    /** Runs `task` on the fetch thread, for file copies that must not block the UI. */
    void background(Runnable task) { worker.execute(task); }

    void post(Runnable task) { main.post(() -> { if (!closed) task.run(); }); }

    private void deliver(String requestId, Result result) {
        if (closed) return;
        try {
            JSONObject event = Bridge.event("fetchCompleted").put("requestId", requestId).put("status", result.status)
                .put("error", nullable(result.error)).put("etag", nullable(result.etag)).put("finalUrl", nullable(result.finalUrl))
                .put("rateRemaining", nullable(result.rateRemaining)).put("rateReset", nullable(result.rateReset))
                .put("body", nullable(result.body)).put("path", nullable(result.path));
            events.accept(event);
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    private static Object nullable(Object value) { return value == null ? JSONObject.NULL : value; }

    private Result run(String url, long maxBytes, String etag, File target, Set<String> hosts) {
        Result result = new Result();
        String current = url;
        try {
            for (int hop = 0; ; hop++) {
                URI uri = new URI(current);
                if (!"https".equals(uri.getScheme()) || uri.getHost() == null || !hosts.contains(uri.getHost())) {
                    return refused("Genesis does not fetch from " + (uri.getHost() == null ? current : uri.getHost()));
                }
                HttpURLConnection connection = (HttpURLConnection) uri.toURL().openConnection();
                try {
                    connection.setInstanceFollowRedirects(false);
                    connection.setUseCaches(false);
                    connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                    connection.setReadTimeout(READ_TIMEOUT_MS);
                    connection.setRequestProperty("User-Agent", userAgent);
                    if ("api.github.com".equals(uri.getHost())) {
                        connection.setRequestProperty("Accept", "application/vnd.github+json");
                        connection.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
                        if (etag != null) connection.setRequestProperty("If-None-Match", etag);
                    }
                    int status = connection.getResponseCode();
                    if (status >= 300 && status < 400 && status != 304) {
                        String location = connection.getHeaderField("Location");
                        if (location == null) return refused("GitHub sent a redirect without a location");
                        if (hop >= MAX_REDIRECTS) return refused("Too many redirects");
                        current = uri.resolve(location).toString();
                        continue;
                    }
                    result.status = status;
                    result.finalUrl = current;
                    result.etag = connection.getHeaderField("ETag");
                    Long remaining = header(connection, "X-RateLimit-Remaining");
                    result.rateRemaining = remaining == null ? null : remaining.intValue();
                    result.rateReset = header(connection, "X-RateLimit-Reset");
                    long length = connection.getContentLengthLong();
                    if (length > maxBytes) return refused("The file is larger than Genesis accepts");
                    InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    if (input == null || status == 304) return result;
                    try (InputStream body = input) {
                        if (target != null && status == 200) {
                            write(body, target, maxBytes);
                            result.path = target.getAbsolutePath();
                        } else {
                            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                            copy(body, bytes, maxBytes);
                            result.body = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
                        }
                    }
                    return result;
                } finally {
                    connection.disconnect();
                }
            }
        } catch (IOException | URISyntaxException | IllegalArgumentException error) {
            return refused(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
        }
    }

    private static Result refused(String error) {
        Result result = new Result();
        result.error = error;
        return result;
    }

    private static Long header(HttpURLConnection connection, String name) {
        String value = connection.getHeaderField(name);
        if (value == null) return null;
        try { return Long.parseLong(value.trim()); }
        catch (NumberFormatException error) { return null; }
    }

    /** Writes through `<target>.part` and renames, so the host never reads half a file. */
    private static void write(InputStream input, File target, long maxBytes) throws IOException {
        File directory = target.getParentFile();
        if (directory != null && !directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create " + directory);
        File part = new File(directory, target.getName() + ".part");
        try {
            try (OutputStream output = new FileOutputStream(part)) { copy(input, output, maxBytes); }
            if (!part.renameTo(target)) throw new IOException("Cannot save " + target.getName());
        } finally {
            if (part.exists() && !part.delete()) part.deleteOnExit();
        }
    }

    /** Copies at most `maxBytes`, failing on more. */
    static void copy(InputStream input, OutputStream output, long maxBytes) throws IOException {
        byte[] buffer = new byte[65536];
        long total = 0;
        for (int count; (count = input.read(buffer)) != -1; ) {
            total += count;
            if (total > maxBytes) throw new IOException("The file is larger than Genesis accepts");
            output.write(buffer, 0, count);
        }
    }

    void close() {
        closed = true;
        worker.shutdownNow();
    }
}
