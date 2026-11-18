package app.nirvana.genesis;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.widget.Toast;
import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One window's website downloads: `https` files through DownloadManager, `data:` URLs decoded in
 * the shell, and `blob:` URLs that the page agent reads and hands over in pieces. A blob's bytes
 * go to a file in the cache as they arrive, never into one buffer of the size the page claims,
 * and are copied to Downloads from there. A second download from one page asks first.
 */
final class Downloads {
    /** The most bytes a page agent may hand over for one download (the SDK's `BLOB_DOWNLOAD_LIMIT`). */
    private static final long BLOB_LIMIT = 128L * 1024 * 1024;
    /** How long the agent has to hand over a blob download. */
    private static final long BLOB_TIMEOUT_MS = 60_000;
    /** How long the agent has to name a `data:` download before it is saved under its own name. */
    private static final long DATA_NAME_TIMEOUT_MS = 1_000;
    /** Bytes per read and write when copying to Downloads. */
    private static final int COPY_BYTES = 64 * 1024;
    /** The cache folder that holds blob downloads while they arrive. */
    private static final String FOLDER = "downloads";
    /** Copies network streams to Downloads, so a slow server never holds up `UserActions.IO`. */
    private static final ExecutorService STREAMS = Executors.newCachedThreadPool();
    /** Set once a process cleared the files an earlier process left behind. */
    private static boolean cleared;

    /**
     * A `blob:` download the page agent is reading: its header, then its bytes. For a `data:`
     * download, which the shell reads itself, the agent only names the file. The UI thread owns
     * every field except `out` and `broken`, which only `UserActions.IO` touches, in order.
     */
    private static final class PendingBlob {
        final long token;
        /** From the Content-Disposition, or null. */
        final String name;
        /** The link's `download` name from the agent, which wins over `name`, or null. */
        String named;
        /** The `data:` URL whose name the agent was asked for, or null for a blob. */
        String dataUrl;
        /** The page address the download came from, for the repeat-download question. */
        String from;
        String mime;
        long size = -1;
        /** Base64 chunks the header announced; -1 for one ArrayBuffer. */
        int chunks = -1;
        int received;
        /** The header arrived and the bytes go to the cache file. */
        boolean receiving;
        /** Bytes handed to the cache file so far. */
        long written;
        Runnable timeout;
        /** The cache file and its stream; `UserActions.IO` only. */
        File file;
        OutputStream out;
        /** Creating or writing the cache file failed; `UserActions.IO` only. */
        boolean broken;

        PendingBlob(long token, String name, String mime) {
            this.token = token;
            this.name = name;
            this.mime = mime;
        }
    }

    private final Activity activity;
    private final Shell shell;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final File folder;
    /** The `blob:` download each page's agent is reading for the shell. */
    private final Map<Views.Page, PendingBlob> blobs = new HashMap<>();
    private long blobTokens;
    /** The open "Download another file?" question, or null. */
    private android.app.Dialog question;

    Downloads(Activity activity, Shell shell) {
        this.activity = activity;
        this.shell = shell;
        folder = new File(activity.getCacheDir(), FOLDER);
        if (!cleared) {
            cleared = true;
            // Runs before any blob of this process can create a file there.
            UserActions.IO.execute(() -> {
                File[] left = folder.listFiles();
                if (left != null) for (File file : left) if (!file.delete()) file.deleteOnExit();
            });
        }
    }

    // -----------------------------------------------------------------------------------------
    // Starting a download

    /**
     * The page started a download, which `SitePolicy` already allowed. An `https` file goes to
     * DownloadManager with the page's cookies; a `data:` URL is decoded here; a `blob:` URL is read
     * by the page agent, which runs on declared origins only.
     */
    void start(Views.Page page, String url, String userAgent, String disposition, String mimeType) {
        String scheme = Uri.parse(url).getScheme();
        if (DebugLog.any) DebugLog.log(page.ref.optString("appletId"), "download.start", "role", page.role, "scheme", scheme, "mime", mimeType);
        boolean web = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        boolean blob = "blob".equalsIgnoreCase(scheme);
        if ((!web && !blob && !"data".equalsIgnoreCase(scheme)) || (blob && page.tab.channel() == null)) {
            Toast.makeText(activity, "This download isn't supported in Genesis", Toast.LENGTH_SHORT).show();
            return;
        }
        // A data: or blob: URL names no file: a Content-Disposition with a file name can, and so can
        // the clicked link's `download` attribute, which only the page agent knows.
        boolean named = disposition != null && disposition.toLowerCase(java.util.Locale.ROOT).contains("filename");
        String name = web || named ? android.webkit.URLUtil.guessFileName(web ? url : "", disposition, mimeType) : null;
        String from = web ? url : String.valueOf(page.tab.url());
        if (!web && !blob && page.tab.channel() != null) { requestDataName(page, url, name, from); return; }
        confirm(page, from, name, web ? () -> startDownload(page, url, userAgent, mimeType, name)
            : blob ? () -> requestBlob(page, url, name, mimeType)
            : () -> saveData(url, name), null);
    }

    /**
     * A response the engine already holds, which `SitePolicy` already allowed: it is saved as it
     * streams in, with the same question as other downloads. A declined one is closed.
     */
    void saveResponse(Views.Page page, String url, InputStream body, String disposition, String mimeType, long length) {
        String scheme = Uri.parse(url).getScheme();
        boolean web = "https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme);
        String name = android.webkit.URLUtil.guessFileName(web ? url : "", disposition, mimeType);
        if (DebugLog.any) DebugLog.log(page.ref.optString("appletId"), "download.start", "role", page.role, "scheme", scheme, "mime", mimeType);
        confirm(page, web ? url : String.valueOf(page.tab.url()), name, () -> save(body, name, mimeType, length), () -> close(body));
    }

    /** Closes a response body that won't be read. */
    static void close(InputStream body) {
        STREAMS.execute(() -> {
            try { body.close(); } catch (IOException ignored) { /* Nothing more to release. */ }
        });
    }

    /**
     * Runs `start`, asking first when `page` already downloaded a file. `declined`, which may be
     * null, runs instead when the user cancels the question or the window closes it. Main thread.
     */
    void confirm(Views.Page page, String from, String name, Runnable start, Runnable declined) {
        // A popup counts against the page that opened it, since each download can open a new one.
        Views.Page counted = page.opener != null ? page.opener : page;
        if (counted.downloads++ == 0) { start.run(); return; }
        if (question != null) question.dismiss();
        boolean[] started = { false };
        android.app.Dialog dialog = new MaterialAlertDialogBuilder(activity)
            .setTitle("Download another file?")
            .setMessage(Shell.linkTitle(from) + " wants to download " + (name == null ? "a file" : name) + ".")
            .setPositiveButton("Download", (d, w) -> { started[0] = true; start.run(); })
            .setNegativeButton("Cancel", null)
            .create();
        dialog.setOnDismissListener(d -> {
            if (question == dialog) question = null;
            if (!started[0] && declined != null) declined.run();
        });
        question = dialog;
        dialog.show();
    }

    /**
     * DownloadManager sends the Cookie header to every host a redirect reaches. Fetching the file in
     * the shell would scope cookies per host; until then this is a known limit. API 26 to 28 would
     * need a storage permission for the public Downloads folder, so there the file goes to
     * Genesis's own Downloads folder.
     */
    boolean startDownload(Views.Page page, String url, String userAgent, String mimeType, String name) {
        android.app.DownloadManager.Request request = new android.app.DownloadManager.Request(Uri.parse(url))
            .setMimeType(mimeType)
            .setTitle(name)
            .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        String cookie = page.site.cookies(url);
        if (cookie != null) request.addRequestHeader("Cookie", cookie);
        if (userAgent != null) request.addRequestHeader("User-Agent", userAgent);
        if (Build.VERSION.SDK_INT >= 29) request.setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, name);
        else request.setDestinationInExternalFilesDir(activity, android.os.Environment.DIRECTORY_DOWNLOADS, name);
        try {
            ((android.app.DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(request);
            Toast.makeText(activity, "Downloading " + name, Toast.LENGTH_SHORT).show();
            return true;
        } catch (RuntimeException error) {
            shell.showError("The download couldn't start: " + error.getMessage());
            return false;
        }
    }

    /**
     * Saves a response body the engine already holds open to Downloads and tells the user how it
     * went. Callable from any thread: the copy runs on a background thread, in 64 KiB pieces, and
     * `body` is always closed. `length` is the expected size, or -1 when unknown; a body that ends
     * short of it counts as broken.
     */
    void save(InputStream body, String name, String mime, long length) {
        STREAMS.execute(() -> {
            String message;
            try (InputStream in = body) {
                write(activity, name, mime, in, length);
                message = "Saved " + name + " to Downloads";
            } catch (IOException | RuntimeException error) {
                message = "The file couldn't be saved";
            }
            toast(message);
        });
    }

    /** A website's own `data:` download, which the shell already allowed. `filename` may be null. */
    private void saveData(String url, String filename) {
        UserActions.IO.execute(() -> {
            UserActions.Data data;
            try {
                data = UserActions.decode(url);
            } catch (IllegalArgumentException error) {
                toast("The download couldn't be read");
                return;
            }
            String name = filename != null ? filename : data.name();
            String message;
            try {
                write(activity, name, data.mime, new java.io.ByteArrayInputStream(data.bytes), data.bytes.length);
                message = "Saved " + name + " to Downloads";
            } catch (IOException | RuntimeException error) {
                message = "The file couldn't be saved";
            }
            toast(message);
        });
    }

    // -----------------------------------------------------------------------------------------
    // Blob downloads

    /** Asks the page agent for the bytes of `url`; a new download replaces one still under way. */
    private void requestBlob(Views.Page page, String url, String name, String mime) {
        PendingBlob blob = newBlob(page, name, mime, BLOB_TIMEOUT_MS);
        try {
            page.post(new JSONObject().put("type", "genesis.blob").put("token", blob.token).put("url", url)
                .put("buffers", page.tab.postsBytes()).toString());
        } catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /**
     * Asks the page agent for the `download` name of the `data:` link the user clicked, then saves
     * `url`. The name comes first, since the agent remembers the click only briefly.
     */
    private void requestDataName(Views.Page page, String url, String name, String from) {
        PendingBlob blob = newBlob(page, name, null, DATA_NAME_TIMEOUT_MS);
        blob.dataUrl = url;
        blob.from = from;
        try { page.post(new JSONObject().put("type", "genesis.blob").put("token", blob.token).put("url", "data:").put("nameOnly", true).toString()); }
        catch (JSONException ignored) { /* Unreachable for these values. */ }
    }

    /** Starts waiting for the agent's answer, in place of a download still under way. */
    private PendingBlob newBlob(Views.Page page, String name, String mime, long timeoutMs) {
        drop(page);
        PendingBlob blob = new PendingBlob(++blobTokens, name, mime);
        blobs.put(page, blob);
        blob.timeout = () -> { if (blobs.get(page) == blob) fail(page); };
        main.postDelayed(blob.timeout, timeoutMs);
        return blob;
    }

    /** A `genesis.blob` header or `genesis.blobChunk` from the page agent. Main thread. */
    void message(Views.Page page, String payload) {
        PendingBlob blob = blobs.get(page);
        if (blob == null) return;
        JSONObject message;
        try { message = new JSONObject(payload); } catch (JSONException error) { fail(page); return; }
        if (message.optLong("token", -1) != blob.token) return;
        if ("genesis.blob".equals(message.optString("type"))) {
            String named = downloadName(message.optString("name", ""));
            if (blob.dataUrl != null) {
                blobs.remove(page);
                main.removeCallbacks(blob.timeout);
                confirmData(page, blob, named != null ? named : blob.name);
                return;
            }
            if (named != null) blob.named = named;
            long size = message.optLong("size", -1);
            if (message.has("error") || blob.receiving || size < 0 || size > BLOB_LIMIT) { fail(page); return; }
            String mime = message.optString("mime", "").split(";", 2)[0].trim();
            if (!mime.isEmpty()) blob.mime = mime;
            blob.size = size;
            blob.chunks = message.optInt("chunks", -1);
            blob.receiving = true;
            UserActions.IO.execute(() -> open(blob));
            if (blob.chunks == 0) finish(page, blob);
        } else if ("genesis.blobChunk".equals(message.optString("type"))) {
            if (!blob.receiving || blob.chunks < 0 || message.optInt("seq", -1) != blob.received) { fail(page); return; }
            byte[] piece;
            try { piece = android.util.Base64.decode(message.optString("data"), android.util.Base64.DEFAULT); }
            catch (IllegalArgumentException error) { fail(page); return; }
            if (!append(blob, piece)) { fail(page); return; }
            if (++blob.received == blob.chunks) finish(page, blob);
        }
    }

    /** The one `ArrayBuffer` of a blob download whose header announced no chunks. Main thread. */
    void bytes(Views.Page page, byte[] bytes) {
        PendingBlob blob = blobs.get(page);
        if (blob == null || !blob.receiving || blob.chunks != -1 || blob.written > 0) return;
        if (!append(blob, bytes)) { fail(page); return; }
        finish(page, blob);
    }

    /** Hands `piece` to the cache file; false when the page sent more than it announced. */
    private boolean append(PendingBlob blob, byte[] piece) {
        blob.written += piece.length;
        if (blob.written > blob.size) return false;
        UserActions.IO.execute(() -> {
            if (blob.broken) return;
            try { blob.out.write(piece); }
            catch (IOException error) { blob.broken = true; }
        });
        return true;
    }

    private void finish(Views.Page page, PendingBlob blob) {
        if (blob.written != blob.size) { fail(page); return; }
        blobs.remove(page);
        main.removeCallbacks(blob.timeout);
        String mime = blob.mime == null || blob.mime.isEmpty() ? "application/octet-stream" : blob.mime;
        String name = blob.named != null ? blob.named : blob.name != null ? blob.name : defaultName(mime);
        UserActions.IO.execute(() -> {
            String message = "The file couldn't be saved";
            close(blob);
            if (!blob.broken) {
                try (InputStream in = new FileInputStream(blob.file)) {
                    write(activity, name, mime, in, blob.size);
                    message = "Saved " + name + " to Downloads";
                } catch (IOException | RuntimeException error) {
                    message = "The file couldn't be saved";
                }
            }
            delete(blob);
            toast(message);
        });
    }

    /** Ends the agent's pending download of `page`: a blob fails, and a `data:` URL saves under its own name. */
    private void fail(Views.Page page) {
        PendingBlob blob = blobs.get(page);
        if (blob == null) return;
        drop(page);
        if (blob.dataUrl == null) Toast.makeText(activity, "The download couldn't be read", Toast.LENGTH_SHORT).show();
    }

    /** Stops waiting for the agent: a blob download is dropped with its file, and a `data:` URL saves under its own name. */
    void drop(Views.Page page) {
        PendingBlob blob = blobs.remove(page);
        if (blob == null) return;
        main.removeCallbacks(blob.timeout);
        if (blob.receiving) UserActions.IO.execute(() -> { close(blob); delete(blob); });
        if (blob.dataUrl != null) confirmData(page, blob, blob.name);
    }

    private void confirmData(Views.Page page, PendingBlob blob, String name) {
        confirm(page, blob.from, name, () -> saveData(blob.dataUrl, name), null);
    }

    /** The window closes or changes applet: pending downloads end with their files, and the question closes. */
    void destroy() {
        for (PendingBlob blob : blobs.values()) {
            main.removeCallbacks(blob.timeout);
            if (blob.receiving) UserActions.IO.execute(() -> { close(blob); delete(blob); });
        }
        blobs.clear();
        if (question != null) question.dismiss();
        question = null;
    }

    // The cache file, on `UserActions.IO` only.

    private void open(PendingBlob blob) {
        try {
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("No cache folder");
            blob.file = File.createTempFile("blob", ".part", folder);
            blob.out = new FileOutputStream(blob.file);
        } catch (IOException error) {
            blob.broken = true;
        }
    }

    private static void close(PendingBlob blob) {
        if (blob.out == null) return;
        try { blob.out.close(); } catch (IOException error) { blob.broken = true; }
        blob.out = null;
    }

    private static void delete(PendingBlob blob) {
        if (blob.file != null && !blob.file.delete()) blob.file.deleteOnExit();
        blob.file = null;
    }

    // -----------------------------------------------------------------------------------------
    // Writing to Downloads

    /**
     * Android 10+ writes to the public Downloads folder; 8 and 9 to Genesis's own, as
     * `startDownload` does. Copies `in` in 64 KiB pieces; `length` is the expected size, or -1.
     * Runs off the UI thread.
     */
    static void write(Context context, String name, String mime, InputStream in, long length) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, name);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri item = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IOException("Downloads is not available");
            try (OutputStream out = resolver.openOutputStream(item)) {
                if (out == null) throw new IOException("Downloads is not available");
                copy(in, out, length);
            } catch (IOException | RuntimeException error) {
                resolver.delete(item, null, null);
                throw error;
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(item, values, null, null);
            return;
        }
        File downloads = context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
        if (downloads == null || (!downloads.isDirectory() && !downloads.mkdirs())) throw new IOException("Downloads is not available");
        File file = new File(downloads, name);
        try (OutputStream out = new FileOutputStream(file)) {
            copy(in, out, length);
        } catch (IOException | RuntimeException error) {
            if (!file.delete()) file.deleteOnExit();
            throw error;
        }
    }

    private static void copy(InputStream in, OutputStream out, long length) throws IOException {
        byte[] buffer = new byte[COPY_BYTES];
        long total = 0;
        for (int count; (count = in.read(buffer)) != -1; total += count) out.write(buffer, 0, count);
        if (length >= 0 && total < length) throw new IOException("The download ended early");
    }

    /** `download`, with the extension of `mime` when Android knows one. */
    static String defaultName(String mime) {
        String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        return "download" + (extension == null ? "" : "." + extension);
    }

    /** A file name the page gave, without any folder, or null when it gave none. */
    private static String downloadName(String name) {
        String base = name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).trim();
        return base.isEmpty() || base.equals(".") || base.equals("..") ? null : base;
    }

    private void toast(String message) {
        main.post(() -> Toast.makeText(activity, message, Toast.LENGTH_SHORT).show());
    }
}
