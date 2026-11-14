package app.nirvana.genesis;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.ext.SdkExtensions;
import android.provider.MediaStore;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

/** One system picker, tied to the requesting document. Files never enter applet storage. */
final class FileSelection {
    private final Activity activity;
    private ValueCallback<Uri[]> callback;
    private BooleanSupplier valid;
    private int requestCode = 41000;
    private boolean multiple;
    private String[] mimeTypes;

    FileSelection(Activity activity) { this.activity = activity; }

    @SuppressWarnings("deprecation")
    void open(WebChromeClient.FileChooserParams params, ValueCallback<Uri[]> result, BooleanSupplier current) {
        cancel();
        int mode = params.getMode();
        if (mode != WebChromeClient.FileChooserParams.MODE_OPEN && mode != WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            result.onReceiveValue(null); return;
        }
        callback = result; valid = current; multiple = mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        List<String> accepted = new ArrayList<>();
        for (String value : params.getAcceptTypes()) {
            for (String part : value.split(",")) {
                String mime = part.trim().toLowerCase(java.util.Locale.ROOT);
                if (mime.startsWith(".")) mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(mime.substring(1));
                if (mime != null && mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+*-]+")) accepted.add(mime);
            }
        }
        mimeTypes = accepted.toArray(new String[0]);
        Intent intent = media() && photoPicker() ? photoPicker(mediaType()) : documentPicker();
        requestCode = requestCode == 45000 ? 41000 : requestCode + 1;
        try { activity.startActivityForResult(intent, requestCode); }
        catch (android.content.ActivityNotFoundException error) { cancel(); }
    }

    /** The system document picker, for any accepted file type. */
    private Intent documentPicker() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeTypes.length == 1 ? mimeTypes[0] : "*/*")
            .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (mimeTypes.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        return intent;
    }

    /** The Android photo picker, which needs no storage permission. Its result is read like the document picker's. */
    @android.annotation.SuppressLint("NewApi")
    private Intent photoPicker(String type) {
        Intent intent = new Intent(MediaStore.ACTION_PICK_IMAGES);
        if (type != null) intent.setType(type);
        if (multiple) intent.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX, Math.min(16, MediaStore.getPickImagesMaxLimit()));
        return intent;
    }

    /** Whether every accepted type is an image or a video. An input with no accept list takes any file. */
    private boolean media() {
        if (mimeTypes.length == 0) return false;
        for (String type : mimeTypes) if (!type.startsWith("image/") && !type.startsWith("video/")) return false;
        return true;
    }

    /** The one type the photo picker filters by, or null to show images and videos. */
    private String mediaType() {
        if (mimeTypes.length == 1) return mimeTypes[0];
        boolean images = true, videos = true;
        for (String type : mimeTypes) { images &= type.startsWith("image/"); videos &= type.startsWith("video/"); }
        return images ? "image/*" : videos ? "video/*" : null;
    }

    /** ACTION_PICK_IMAGES exists on Android 13 and on Android 11 and 12 with the R extension version 2. */
    private static boolean photoPicker() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return true;
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2;
    }

    boolean result(int code, int status, Intent data) {
        if (code < 41000 || code > 45000) return false;
        if (code != requestCode || callback == null) return true;
        List<Uri> selected = new ArrayList<>();
        if (status == Activity.RESULT_OK && data != null && valid.getAsBoolean()) {
            ClipData clip = data.getClipData();
            if (clip != null) for (int i = 0; i < Math.min(clip.getItemCount(), 17); i++) selected.add(clip.getItemAt(i).getUri());
            else if (data.getData() != null) selected.add(data.getData());
        }
        boolean acceptable = !selected.isEmpty() && selected.size() <= (multiple ? 16 : 1);
        for (Uri uri : selected) {
            if (uri == null || !"content".equals(uri.getScheme())) { acceptable = false; break; }
            try {
                String type = activity.getContentResolver().getType(uri);
                if (mimeTypes.length > 0 && !matches(type)) { acceptable = false; break; }
            } catch (SecurityException error) { acceptable = false; break; }
        }
        ValueCallback<Uri[]> pending = callback; callback = null; valid = null;
        pending.onReceiveValue(acceptable ? selected.toArray(new Uri[0]) : null);
        return true;
    }

    private boolean matches(String type) {
        if (type == null) return false;
        for (String accepted : mimeTypes) if (accepted.equals(type) || accepted.endsWith("/*") && type.startsWith(accepted.substring(0, accepted.length() - 1))) return true;
        return false;
    }
    void cancelIfInvalid() { if (callback != null && !valid.getAsBoolean()) cancel(); }
    void cancel() {
        ValueCallback<Uri[]> pending = callback; callback = null; valid = null;
        if (pending != null) pending.onReceiveValue(null);
    }
}
