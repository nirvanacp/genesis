package app.nirvana.genesis;

import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The shell's file IO. The host owns {@code files/applets/}; the shell only reads manifests from it
 * and moves files into {@code files/genesis-import/}, where the CLI also writes, and
 * {@code files/genesis-bundled/}, where it stages the APK's applets.
 */
final class Files {
    static final String IMPORT_DIRECTORY = "genesis-import";
    static final String BUNDLED_ASSETS = "bundles";
    static final String BUNDLED_DIRECTORY = "genesis-bundled";
    private static final long IMPORT_MAX_BYTES = 64L * 1024 * 1024;

    private final Activity activity;
    private final File imports;
    private final File bundled;

    Files(Activity activity) {
        this.activity = activity;
        imports = new File(activity.getFilesDir(), IMPORT_DIRECTORY);
        bundled = new File(activity.getFilesDir(), BUNDLED_DIRECTORY);
    }

    File importDirectory() { return imports; }

    /** Bundle files to hand to the host, oldest first. */
    List<File> bundleImports() { return list(imports, Files::isBundle); }

    /** Staged APK applets to hand to the host, oldest first. */
    List<File> bundledImports() { return list(bundled, Files::isBundle); }

    /** `applet-<id>.release.json` beside a bundle, or null. */
    static File releaseRecord(File bundle) {
        return new File(bundle.getParentFile(), bundle.getName().replaceFirst("\\.bundle\\.json$", ".release.json"));
    }

    private static boolean isBundle(String name) { return name.startsWith("applet-") && name.endsWith(".bundle.json"); }

    /** Service credential records, handled by {@link ServiceClient}. */
    List<File> serviceImports() {
        return list(imports, name -> name.startsWith("service-") && name.endsWith(".json") && !name.endsWith(".receipt.json"));
    }

    private static List<File> list(File directory, java.util.function.Predicate<String> accept) {
        File[] found = directory.listFiles(file -> file.isFile() && accept.test(file.getName()));
        if (found == null) return new ArrayList<>();
        Arrays.sort(found, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
        return new ArrayList<>(Arrays.asList(found));
    }

    String read(File file, long maxBytes) throws IOException {
        if (file.length() > Math.min(maxBytes, IMPORT_MAX_BYTES)) throw new IOException(file.getName() + " is too large");
        return new String(java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    /** Writes `<name>.receipt.json` next to an import the shell handled itself. */
    void receipt(File source, JSONObject receipt) {
        String name = source.getName().replaceFirst("\\.json$", "") + ".receipt.json";
        try { writeAtomic(new File(imports, name), receipt.toString().getBytes(StandardCharsets.UTF_8)); }
        catch (IOException ignored) { /* The CLI times out instead. */ }
    }

    /**
     * Copies the APK's bundled applets, with their release records, into the bundled directory once
     * per APK install or update. The host installs them like an import.
     */
    void stageBundledApplets() throws IOException {
        long installed;
        try { installed = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).lastUpdateTime; }
        catch (PackageManager.NameNotFoundException error) { throw new IOException(error); }
        SharedPreferences state = activity.getSharedPreferences("genesis-shell", Activity.MODE_PRIVATE);
        if (state.getLong("bundledInstall", 0) == installed) return;
        String[] names = activity.getAssets().list(BUNDLED_ASSETS);
        for (String name : names == null ? new String[0] : names) {
            if (!isBundle(name) && !(name.startsWith("applet-") && name.endsWith(".release.json"))) continue;
            try (InputStream input = activity.getAssets().open(BUNDLED_ASSETS + "/" + name)) {
                java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[65536];
                for (int count; (count = input.read(buffer)) != -1; ) bytes.write(buffer, 0, count);
                writeAtomic(new File(bundled, name), bytes.toByteArray());
            }
        }
        if (!state.edit().putLong("bundledInstall", installed).commit()) throw new IOException("Could not record bundled install");
    }

    /** Service ids the installed applet declares in `capabilities.services`, read from the host's copy of its bundle. */
    List<String> declaredServices(String appletId) {
        List<String> ids = new ArrayList<>();
        try {
            File root = new File(activity.getFilesDir(), "applets");
            JSONArray index = new JSONArray(read(new File(root, "index.json"), 1024 * 1024));
            for (int i = 0; i < index.length(); i++) {
                JSONObject entry = index.getJSONObject(i);
                if (!appletId.equals(entry.getString("appletId"))) continue;
                File bundle = new File(root, appletId + "/" + entry.getLong("revision") + "/bundle.json");
                JSONObject manifest = new JSONObject(read(bundle, 1024 * 1024)).getJSONObject("manifest");
                JSONArray services = manifest.getJSONObject("capabilities").optJSONArray("services");
                for (int j = 0; services != null && j < services.length(); j++) ids.add(services.getJSONObject(j).getString("id"));
            }
        } catch (IOException | JSONException ignored) { /* Not installed or unreadable: nothing declared. */ }
        return ids;
    }

    static void writeAtomic(File target, byte[] bytes) throws IOException {
        File directory = target.getParentFile();
        if (directory != null && !directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create " + directory);
        File temporary = new File(directory, "." + target.getName() + ".tmp");
        try (java.io.FileOutputStream output = new java.io.FileOutputStream(temporary)) {
            output.write(bytes);
            output.getFD().sync();
        }
        if (!temporary.renameTo(target)) throw new IOException("Cannot replace " + target);
    }
}
