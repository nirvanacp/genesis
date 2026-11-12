package app.nirvana.genesis;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The manager window: the Genesis list, the add, review and update flows, and settings. It also
 * takes bundles and links other apps share with Genesis. Applets run in their own windows.
 */
public final class MainActivity extends WindowActivity {
    private static final long BUNDLE_MAX_BYTES = 64L * 1024 * 1024;
    private static final long RELEASE_MAX_BYTES = 1024 * 1024;
    private static final int PICK_APPLET_FILE = 46000;

    @Override String window() { return null; }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!createWindow()) return;
        send(Bridge.event("managerAttached"));
        runtime.main.post(() -> openedFile(getIntent()));
    }

    @Override public void pickAppletFile() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        try { startActivityForResult(intent, PICK_APPLET_FILE); }
        catch (android.content.ActivityNotFoundException error) { shell.showError("No app can pick files on this phone."); }
    }

    /** A bundle another app opened or shared with Genesis. The intent is consumed so it runs once. */
    private void openedFile(Intent intent) {
        if (intent == null || runtime == null || !runtime.attached()) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) uris.add(intent.getData());
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri stream = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : streamExtra(intent);
            if (stream != null) uris.add(stream);
            else if (intent.hasExtra(Intent.EXTRA_TEXT)) {
                setIntent(new Intent(this, MainActivity.class));
                sharedText(intent.getCharSequenceExtra(Intent.EXTRA_TEXT));
                return;
            }
        }
        if (uris.isEmpty()) return;
        setIntent(new Intent(this, MainActivity.class));
        reviewFiles(uris);
    }

    /** Text shared with Genesis: its first website link opens in the applet that uses that site. */
    private void sharedText(CharSequence text) {
        java.util.regex.Matcher link = java.util.regex.Pattern.compile("https?://\\S+", java.util.regex.Pattern.CASE_INSENSITIVE)
            .matcher(text == null ? "" : text);
        if (link.find()) shell.openUrl(trimLink(link.group()), null, true);
        else shell.showInfo("Genesis", "This doesn't contain a website link");
    }

    /**
     * A link quoted in a sentence ends at its closing punctuation, which is not part of the URL. A
     * closing bracket stays when the link opens one to match it, as in `.../Genesis_(app)`.
     */
    static String trimLink(String link) {
        int end = link.length();
        while (end > 0) {
            char last = link.charAt(end - 1);
            int bracket = ")]}".indexOf(last);
            if (bracket >= 0) {
                String head = link.substring(0, end - 1);
                if (count(head, "([{".charAt(bracket)) > count(head, last)) break;
            } else if (".,;:!?>'\"".indexOf(last) < 0) {
                break;
            }
            end--;
        }
        return link.substring(0, end);
    }

    private static int count(String text, char c) {
        int n = 0;
        for (int i = 0; i < text.length(); i++) if (text.charAt(i) == c) n++;
        return n;
    }

    @SuppressWarnings("deprecation")
    private static Uri streamExtra(Intent intent) { return intent.getParcelableExtra(Intent.EXTRA_STREAM); }

    /**
     * Copies the picked bundle into the fetch folder, reads a picked release record, and asks the
     * host to review them. The copy runs on the fetch thread.
     */
    private void reviewFiles(List<Uri> uris) {
        ContentResolver resolver = getContentResolver();
        File directory = runtime.fetcher.directory();
        runtime.fetcher.background(() -> {
            File bundle = null;
            String release = null, error = null;
            try {
                for (Uri uri : uris) {
                    if (!"content".equals(uri.getScheme())) throw new java.io.IOException("Genesis opens only files shared by another app");
                    String name = displayName(resolver, uri);
                    if (name != null && name.endsWith(".release.json")) {
                        if (release != null) throw new java.io.IOException("Pick one release record");
                        java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                        try (java.io.InputStream input = resolver.openInputStream(uri)) {
                            if (input == null) throw new java.io.IOException("Cannot open " + name);
                            Fetcher.copy(input, bytes, RELEASE_MAX_BYTES);
                        }
                        release = new String(bytes.toByteArray(), java.nio.charset.StandardCharsets.UTF_8);
                        continue;
                    }
                    if (bundle != null) throw new java.io.IOException("Pick one applet bundle at a time");
                    if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("Cannot create " + directory);
                    bundle = new File(directory, "file-" + java.util.UUID.randomUUID() + ".bundle.json");
                    File part = new File(directory, bundle.getName() + ".part");
                    try (java.io.InputStream input = resolver.openInputStream(uri); java.io.OutputStream output = new java.io.FileOutputStream(part)) {
                        if (input == null) throw new java.io.IOException("Cannot open " + (name == null ? "the file" : name));
                        Fetcher.copy(input, output, BUNDLE_MAX_BYTES);
                    } catch (java.io.IOException failed) {
                        if (!part.delete()) part.deleteOnExit();
                        throw failed;
                    }
                    if (!part.renameTo(bundle)) throw new java.io.IOException("Cannot save the file");
                }
                if (bundle == null) throw new java.io.IOException("Pick the applet's .bundle.json file");
            } catch (java.io.IOException | SecurityException failed) {
                error = failed.getMessage();
                if (bundle != null && !bundle.delete()) bundle.deleteOnExit();
                bundle = null;
            }
            String path = bundle == null ? null : bundle.getAbsolutePath(), record = release, message = error;
            runtime.fetcher.post(() -> {
                if (path == null) { shell.showError("Genesis could not read the file: " + message); return; }
                try { send(Bridge.event("reviewFile").put("path", path).put("release", record == null ? JSONObject.NULL : record)); }
                catch (JSONException failed) { throw new IllegalStateException(failed); }
            });
        });
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (RuntimeException ignored) { /* Treated as a bundle. */ }
        return uri.getLastPathSegment();
    }

    @SuppressWarnings("deprecation")
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_APPLET_FILE) { super.onActivityResult(requestCode, resultCode, data); return; }
        if (resultCode != RESULT_OK || data == null || shell == null) return;
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) for (int i = 0; i < Math.min(clip.getItemCount(), 2); i++) uris.add(clip.getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        if (clip != null && clip.getItemCount() > 2) { shell.showError("Pick an applet bundle, and its release record if you have one."); return; }
        if (!uris.isEmpty()) reviewFiles(uris);
    }

    /** `dev install` starts this activity again; one already in front gets only this call. */
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (runtime != null) runtime.main.post(() -> openedFile(getIntent()));
    }
}
