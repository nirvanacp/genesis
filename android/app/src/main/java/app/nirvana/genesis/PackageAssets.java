package app.nirvana.genesis;

import android.webkit.WebResourceResponse;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Reads only host-declared immutable assets, with no network fallback for local URLs. */
final class PackageAssets {
    private final PackageStore assets;
    private final String prefix;
    private final Map<String, String> hashes = new HashMap<>();
    private final Map<String, byte[]> local = new HashMap<>();
    final WebViewAssetLoader loader;

    PackageAssets(PackageStore assets, JSONObject command) throws Exception {
        this.assets = assets;
        JSONObject pack = command.getJSONObject("package");
        prefix = "packages/" + pack.getJSONObject("manifest").getString("id") + "/" + pack.getString("revision") + "/";
        JSONArray declared = pack.getJSONArray("assets");
        for (int i = 0; i < declared.length(); i++) {
            JSONObject entry = declared.getJSONObject(i);
            hashes.put(prefix + entry.getString("path"), entry.getString("sha256"));
        }
        JSONArray mappings = command.getJSONArray("localAssets");
        for (int i = 0; i < mappings.length(); i++) {
            JSONObject entry = mappings.getJSONObject(i);
            String path = entry.getString("urlPath");
            if (!path.startsWith("/genesis/")) throw new IOException("Invalid local asset mapping");
            String assetPath = entry.getString("assetPath");
            if (!entry.getString("sha256").equals(hashes.get(assetPath))) throw new IOException("Local asset hash binding mismatch");
            local.put(path.substring("/genesis/".length()), readVerified(assetPath));
        }
        loader = new WebViewAssetLoader.Builder().addPathHandler("/genesis/", path -> {
            byte[] bytes = local.get(path);
            return bytes == null ? notFound() : new WebResourceResponse("text/html", "UTF-8", new ByteArrayInputStream(bytes));
        }).build();
    }

    byte[] bytes(String entry) throws Exception { return readVerified(prefix + entry); }
    String script(String entry) throws Exception { return new String(readVerified(prefix + entry), StandardCharsets.UTF_8); }
    boolean allowsLocalPath(String path) { return path.startsWith("/genesis/") && local.containsKey(path.substring(9)); }

    private byte[] readVerified(String name) throws Exception {
        if (!hashes.containsKey(name) || !name.startsWith(prefix) || name.contains("..") || name.contains("\\")) {
            throw new IOException("Undeclared package asset");
        }
        byte[] bytes;
        try (InputStream input = assets.open(name); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
                output.write(buffer, 0, count);
                if (output.size() > 4 * 1024 * 1024) throw new IOException("Package asset exceeds 4 MiB");
            }
            bytes = output.toByteArray();
        }
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) digest.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        if (!digest.toString().equals(hashes.get(name))) throw new IOException("Package asset integrity check failed");
        return bytes;
    }
    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(),
            new ByteArrayInputStream("Undeclared local asset".getBytes(StandardCharsets.UTF_8)));
    }
}
