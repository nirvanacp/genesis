package app.nirvana.genesis;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebResourceResponse;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the applet UI may start only from the user's tap: picking files, saving, sharing, opening
 * another app, turning on notifications and granting a hidden page one feature. Each action needs a fresh tap on the applet UI and
 * uses it up. Picked files stay `content:` URIs in the shell, under random ids; the applet holds
 * only the ids, and nothing is copied into applet storage.
 */
final class UserActions {
    /** How long a picked file stays usable, in ms. */
    private static final long FILE_LIFETIME_MS = 30 * 60 * 1000;
    /** The largest picked file, in bytes; larger files are left out of a pick. */
    private static final long FILE_BYTES_MAX = 64L * 1024 * 1024;
    /** Reads picked files off the UI thread. */
    static final ExecutorService IO = Executors.newSingleThreadExecutor();
    private static final SecureRandom RANDOM = new SecureRandom();
    /** Bytes per base64 chunk when the WebView cannot post an ArrayBuffer. */
    private static final int CHUNK_BYTES = 128 * 1024;

    /** One picked file. */
    static final class PickedFile {
        final Uri uri;
        final String name, mime;
        final long size, expiresAt;

        PickedFile(Uri uri, String name, String mime, long size) {
            this.uri = uri;
            this.name = name;
            this.mime = mime;
            this.size = size;
            this.expiresAt = SystemClock.uptimeMillis() + FILE_LIFETIME_MS;
        }
    }

    private final Activity activity;
    private final Shell shell;
    private final Shell.Owner owner;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Read from WebView's request threads for previews, so it is concurrent. */
    private final Map<String, PickedFile> files = new ConcurrentHashMap<>();
    private long lastTapAt;
    private boolean tapUsed = true;

    UserActions(Activity activity, Shell shell, Shell.Owner owner) {
        this.activity = activity;
        this.shell = shell;
        this.owner = owner;
    }

    // -----------------------------------------------------------------------------------------
    // The tap gate

    /** The user lifted a finger on the applet UI. */
    void tapped() {
        lastTapAt = SystemClock.uptimeMillis();
        tapUsed = false;
    }

    /** True once per tap, within `SitePolicy.USER_ACTION_MS` of it. Trusted input to a page never counts. */
    private boolean consumeTap() {
        if (tapUsed || SystemClock.uptimeMillis() - lastTapAt > SitePolicy.USER_ACTION_MS) return false;
        tapUsed = true;
        return true;
    }

    // -----------------------------------------------------------------------------------------
    // Actions

    /** Carries out `action` for the applet and answers `userActionDone` after the command batch. */
    void run(String appletId, long token, JSONObject view, JSONObject action) {
        String kind = action.optString("kind");
        if (kind.equals("share") && view != null) {
            // The website's own Share button: the host checked the page's user activation; the
            // shell checks that the user still sees that website.
            Views.Page page = shell.page(view);
            if (page == null || !page.isRevealed()) { answer(done(token, "USER_ACTION_REQUIRED", "The website shares only while it is shown", null)); return; }
            share(token, text(action, "title"), text(action, "text"), text(action, "url"));
            return;
        }
        if (!consumeTap()) { answer(done(token, "USER_ACTION_REQUIRED", "The action needs a fresh tap on the applet", null)); return; }
        switch (kind) {
            case "pickFiles": pick(token, strings(action.optJSONArray("accept")), action.optBoolean("multiple")); break;
            case "save": save(token, view, action.optString("url"), action.isNull("filename") ? null : action.optString("filename", null)); break;
            case "share": share(token, text(action, "title"), text(action, "text"), text(action, "url")); break;
            case "openExternal": openExternal(token, action.optString("url")); break;
            case "grant": answer(shell.grant(token, view, action.optString("grant"))); break;
            case "enableNotifications":
                shell.setNotificationsOn(appletId, true, on -> answer(done(token, null, null, object("enabled", on))));
                break;
            default: answer(done(token, "INVALID_ARGUMENT", "Unknown action " + kind, null)); break;
        }
    }

    private void pick(long token, String[] accept, boolean multiple) {
        owner.chooseAppletFiles(accept, multiple, uris -> IO.execute(() -> {
            JSONArray picked = new JSONArray();
            if (uris != null) {
                for (Uri uri : uris) {
                    PickedFile file = describe(uri);
                    if (file == null) continue;
                    String id = newId();
                    files.put(id, file);
                    try { picked.put(new JSONObject().put("id", id).put("name", file.name).put("type", file.mime).put("size", file.size)); }
                    catch (JSONException ignored) { /* Unreachable for these values. */ }
                }
            }
            answer(done(token, null, null, object("files", picked)));
        }), shell::hasForeground);
    }

    /** The file's name, type and size, or null when it cannot be read or is too large. */
    private PickedFile describe(Uri uri) {
        ContentResolver resolver = activity.getContentResolver();
        String name = null;
        long size = -1;
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                if (!cursor.isNull(0)) name = cursor.getString(0);
                if (!cursor.isNull(1)) size = cursor.getLong(1);
            }
            if (size < 0) {
                try (android.content.res.AssetFileDescriptor descriptor = resolver.openAssetFileDescriptor(uri, "r")) {
                    if (descriptor != null) size = descriptor.getLength();
                }
            }
        } catch (IOException | RuntimeException error) {
            return null;
        }
        if (size < 0 || size > FILE_BYTES_MAX) return null;
        String mime = resolver.getType(uri);
        return new PickedFile(uri, name == null || name.isEmpty() ? "file" : name, mime == null ? "application/octet-stream" : mime, size);
    }

    /** An `https` URL downloads with the context's cookies; a `data:` URL is written here. */
    private void save(long token, JSONObject view, String url, String filename) {
        if (url.regionMatches(true, 0, "data:", 0, 5)) {
            IO.execute(() -> saveData(token, url, filename));
            return;
        }
        Views.Page page = view == null ? null : shell.page(view);
        if (page == null) { answer(done(token, "NOT_FOUND", "The website is gone", null)); return; }
        String name = filename != null ? filename : URLUtil.guessFileName(url, null, null);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(name));
        if (!shell.startDownload(page, url, page.web.getSettings().getUserAgentString(), mime, name)) {
            answer(done(token, "NOT_FOUND", "The download couldn't start", null));
            return;
        }
        answer(done(token, null, null, object("started", true)));
    }

    private void saveData(long token, String url, String filename) {
        Data data;
        try {
            data = decode(url);
        } catch (IllegalArgumentException error) {
            answer(done(token, "INVALID_ARGUMENT", error.getMessage(), null));
            return;
        }
        String name = filename != null ? filename : data.name();
        try {
            write(name, data.mime, data.bytes);
        } catch (IOException | RuntimeException error) {
            answer(done(token, "STORAGE_FAILURE", "The file couldn't be saved: " + error.getMessage(), null));
            return;
        }
        main.post(() -> Toast.makeText(activity, "Saved " + name + " to Downloads", Toast.LENGTH_SHORT).show());
        answer(done(token, null, null, object("started", true)));
    }

    /** A website's own `data:` download, which the shell already allowed. `filename` may be null. */
    void saveDownload(String url, String filename) {
        IO.execute(() -> {
            try {
                Data data = decode(url);
                saveBytes(filename != null ? filename : data.name(), data.mime, data.bytes);
            } catch (IllegalArgumentException error) {
                main.post(() -> Toast.makeText(activity, "The download couldn't be read", Toast.LENGTH_SHORT).show());
            }
        });
    }

    /** Writes a website's download to Downloads and tells the user how it went. Runs on `IO`. */
    void saveBytes(String name, String mime, byte[] bytes) {
        String message;
        try {
            write(name, mime, bytes);
            message = "Saved " + name + " to Downloads";
        } catch (IOException | RuntimeException error) {
            message = "The file couldn't be saved";
        }
        String text = message;
        main.post(() -> Toast.makeText(activity, text, Toast.LENGTH_SHORT).show());
    }

    /** A decoded `data:` URL. */
    private static final class Data {
        final String mime;
        final byte[] bytes;

        Data(String mime, byte[] bytes) {
            this.mime = mime;
            this.bytes = bytes;
        }

        /** `download`, with the extension of the type when Android knows one. */
        String name() { return defaultName(mime); }
    }

    /** `download`, with the extension of `mime` when Android knows one. */
    static String defaultName(String mime) {
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return "download" + (extension == null ? "" : "." + extension);
    }

    /** Throws IllegalArgumentException with the reason when the URL has no data or bad base64. */
    private static Data decode(String url) {
        int comma = url.indexOf(',');
        if (comma < 0) throw new IllegalArgumentException("The data: URL has no data");
        String meta = url.substring(5, comma);
        boolean base64 = meta.toLowerCase(Locale.ROOT).endsWith(";base64");
        String mime = meta.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (mime.isEmpty()) mime = "text/plain";
        try {
            String data = url.substring(comma + 1);
            return new Data(mime, base64 ? Base64.decode(data, Base64.DEFAULT) : Uri.decode(data).getBytes(StandardCharsets.UTF_8));
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("The data: URL is not valid base64");
        }
    }

    /** Android 10+ writes to the public Downloads folder; 8 and 9 to Genesis's own, as `startDownload` does. */
    private void write(String name, String mime, byte[] bytes) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = activity.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IOException("Downloads is not available");
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IOException("Downloads is not available");
                out.write(bytes);
            } catch (IOException | RuntimeException error) {
                resolver.delete(item, null, null);
                throw error;
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(item, values, null, null);
            return;
        }
        File folder = activity.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
        if (folder == null || (!folder.isDirectory() && !folder.mkdirs())) throw new IOException("Downloads is not available");
        try (OutputStream out = new FileOutputStream(new File(folder, name))) { out.write(bytes); }
    }

    private void share(long token, String title, String text, String url) {
        String body = text == null ? url : url == null ? text : text + "\n" + url;
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body == null ? title : body);
        if (title != null) send.putExtra(Intent.EXTRA_TITLE, title).putExtra(Intent.EXTRA_SUBJECT, title);
        if (!shell.handOff(Intent.createChooser(send, null))) { answer(done(token, "NOT_FOUND", "No app can share this", null)); return; }
        answer(done(token, null, null, object("shown", true)));
    }

    /**
     * App links open in their app. An `https` URL opens only in an app that is not a browser, since a
     * browser would only show the website again; Android 10 and earlier cannot tell, so it answers NOT_FOUND.
     */
    private void openExternal(long token, String url) {
        Intent intent;
        if ("https".equalsIgnoreCase(Uri.parse(url).getScheme())) {
            intent = Build.VERSION.SDK_INT >= 30
                ? new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
                    .addFlags(Intent.FLAG_ACTIVITY_REQUIRE_NON_BROWSER)
                : null;
        } else {
            intent = Handoff.intent(url);
        }
        if (intent == null || !shell.handOff(intent)) { answer(done(token, "NOT_FOUND", "No app can open " + url, null)); return; }
        answer(done(token, null, null, object("opened", true)));
    }

    // -----------------------------------------------------------------------------------------
    // Picked files

    /** A picked file that is still usable, or null. Safe on any thread. */
    PickedFile file(String id) {
        PickedFile file = files.get(id);
        if (file == null) return null;
        if (SystemClock.uptimeMillis() < file.expiresAt) return file;
        files.remove(id);
        return null;
    }

    void release(JSONArray ids) {
        for (int i = 0; i < ids.length(); i++) files.remove(ids.optString(i));
    }

    /** The applet UI is gone: its picked files go with it. */
    void clear() { files.clear(); }

    /** Streams a picked file to the applet UI for `<img>` or `<video>`; unknown ids answer 404. Runs on WebView's request thread. */
    WebResourceResponse preview(String id) {
        PickedFile file = file(id);
        InputStream in = null;
        if (file != null) {
            try { in = activity.getContentResolver().openInputStream(file.uri); }
            catch (IOException | RuntimeException error) { in = null; }
        }
        if (in == null) return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        return new WebResourceResponse(file.mime, null, 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), in);
    }

    // -----------------------------------------------------------------------------------------
    // Sending files to a page

    /** Thrown when a transfer stops; `code` is the error code `filesSent` reports. */
    private static final class Stopped extends Exception {
        final String code;

        Stopped(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    /**
     * Posts picked files to the page agent through the page's reply proxy, then answers `filesSent`.
     * The bytes never pass the host. Each file is a header, then one ArrayBuffer message, or base64
     * chunks where the WebView cannot post one, and the transfer ends with `genesis.filesEnd`.
     * Files are read on `IO`, one piece at a time; only posting runs on the UI thread.
     */
    void send(Views.Page page, long token, JSONArray refs) {
        JavaScriptReplyProxy reply = page == null ? null : page.reply;
        if (reply == null) { answer(sent(token, "CONTEXT_REPLACED", "The page is gone")); return; }
        List<PickedFile> picked = new ArrayList<>();
        for (int i = 0; i < refs.length(); i++) {
            PickedFile file = file(refs.optJSONObject(i) == null ? "" : refs.optJSONObject(i).optString("id"));
            if (file == null) { answer(sent(token, "FILE_UNAVAILABLE", "A picked file expired or was released")); return; }
            picked.add(file);
        }
        boolean buffers = WebFeatures.has(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER);
        IO.execute(() -> {
            try {
                for (int index = 0; index < picked.size(); index++) sendFile(page, reply, token, index, picked.get(index), buffers);
                post(page, reply, message("genesis.filesEnd", token));
                answer(sent(token, null, null));
            } catch (Stopped stopped) {
                answer(sent(token, stopped.code, stopped.getMessage()));
            }
        });
    }

    private void sendFile(Views.Page page, JavaScriptReplyProxy reply, long token, int index, PickedFile file, boolean buffers) throws Stopped {
        try (InputStream in = activity.getContentResolver().openInputStream(file.uri)) {
            if (in == null) throw new Stopped("FILE_UNAVAILABLE", file.name + " can no longer be read");
            JSONObject header = message("genesis.file", token).put("index", index).put("name", file.name).put("mime", file.mime).put("size", file.size);
            if (buffers) {
                byte[] bytes = read(in, file.size);
                post(page, reply, header.toString());
                post(page, reply, bytes);
                return;
            }
            int chunks = (int) ((file.size + CHUNK_BYTES - 1) / CHUNK_BYTES);
            post(page, reply, header.put("chunks", chunks).toString());
            long left = file.size;
            for (int seq = 0; seq < chunks; seq++) {
                byte[] piece = read(in, Math.min(CHUNK_BYTES, left));
                left -= piece.length;
                String data = Base64.encodeToString(piece, Base64.NO_WRAP);
                post(page, reply, message("genesis.fileChunk", token).put("index", index).put("seq", seq).put("data", data).toString());
            }
            if (in.read() != -1) throw new Stopped("FILE_UNAVAILABLE", file.name + " changed after it was picked");
        } catch (IOException | SecurityException | JSONException error) {
            throw new Stopped("FILE_UNAVAILABLE", file.name + " can no longer be read");
        }
    }

    /** Exactly `length` bytes, or FILE_UNAVAILABLE when the file is shorter than when it was picked. */
    private static byte[] read(InputStream in, long length) throws IOException, Stopped {
        byte[] bytes = new byte[(int) length];
        int done = 0;
        while (done < bytes.length) {
            int count = in.read(bytes, done, bytes.length - done);
            if (count < 0) throw new Stopped("FILE_UNAVAILABLE", "A picked file changed after it was picked");
            done += count;
        }
        return bytes;
    }

    /** Posts on the UI thread and waits, so pieces go out in order and one at a time. */
    private void post(Views.Page page, JavaScriptReplyProxy reply, Object payload) throws Stopped {
        boolean[] posted = { false };
        CountDownLatch latch = new CountDownLatch(1);
        main.post(() -> {
            // A new document has a new reply proxy: the files were meant for the old one.
            if (page.reply == reply) {
                if (payload instanceof byte[]) reply.postMessage((byte[]) payload);
                else reply.postMessage((String) payload);
                posted[0] = true;
            }
            latch.countDown();
        });
        try {
            if (!latch.await(30, TimeUnit.SECONDS)) throw new Stopped("DEADLINE", "The page did not take the files in time");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new Stopped("DEADLINE", "The transfer was interrupted");
        }
        if (!posted[0]) throw new Stopped("CONTEXT_REPLACED", "The page changed while the files were sent");
    }

    /** A transfer message; `type` comes first so the page tells it from the host's messages without parsing. */
    private static JSONObject message(String type, long token) throws Stopped {
        try { return new JSONObject().put("type", type).put("token", token); }
        catch (JSONException error) { throw new Stopped("FILE_UNAVAILABLE", "The transfer could not start"); }
    }

    private void post(Views.Page page, JavaScriptReplyProxy reply, JSONObject message) throws Stopped {
        post(page, reply, message.toString());
    }

    /** A `filesSent` event: ok when `code` is null. */
    static JSONObject sent(long token, String code, String message) {
        try {
            JSONObject event = Bridge.event("filesSent").put("token", token).put("ok", code == null);
            if (code != null) event.put("code", code).put("message", message);
            return event;
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    // -----------------------------------------------------------------------------------------
    // Answers

    /** A `userActionDone` event: `result` when `code` is null, otherwise the error. */
    static JSONObject done(long token, String code, String message, JSONObject result) {
        try {
            JSONObject event = Bridge.event("userActionDone").put("token", token).put("ok", code == null);
            if (code != null) event.put("code", code).put("message", message);
            else event.put("result", result == null ? new JSONObject() : result);
            return event;
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
    }

    /** Sent after the command batch under way, since the host is still handling the event that sent it. */
    private void answer(JSONObject event) { main.post(() -> owner.send(event)); }

    private static JSONObject object(String key, Object value) {
        try { return new JSONObject().put(key, value); }
        catch (JSONException error) { throw new IllegalStateException(error); }
    }

    private static String newId() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        StringBuilder id = new StringBuilder(32);
        for (byte b : bytes) id.append(String.format(Locale.ROOT, "%02x", b));
        return id.toString();
    }

    private static String[] strings(JSONArray values) {
        if (values == null) return new String[0];
        String[] result = new String[values.length()];
        for (int i = 0; i < result.length; i++) result[i] = values.optString(i);
        return result;
    }

    private static String text(JSONObject object, String key) {
        return object.isNull(key) ? null : object.optString(key, null);
    }
}
