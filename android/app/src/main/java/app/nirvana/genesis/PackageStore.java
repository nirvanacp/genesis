package app.nirvana.genesis;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.util.AtomicFile;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/** Immutable development revisions. This channel is private, local, and debug-only. */
final class PackageStore {
    private static final int MAX_FILE = 4 * 1024 * 1024;
    private static final int MAX_TOTAL = 8 * 1024 * 1024;
    private static final int MAX_ENVELOPE = 16 * 1024 * 1024;
    private final Context context;
    private final boolean debug;
    private final File root;
    private final AtomicFile registryFile;
    private JSONObject registry = new JSONObject();
    private JSONObject receipt;
    private final Map<String, JSONObject> bundled = new LinkedHashMap<>();
    private final Map<String, JSONObject> effective = new LinkedHashMap<>();
    private final Map<String, JSONObject> locations = new HashMap<>();

    PackageStore(Context context) {
        this.context = context;
        debug = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        root = new File(context.getFilesDir(), "genesis-applets");
        registryFile = new AtomicFile(new File(root, "registry.json"));
    }

    JSONObject load() throws Exception {
        JSONObject index;
        try (InputStream input = context.getAssets().open("packages/index.json")) {
            index = new JSONObject(new String(read(input, 1024 * 1024), StandardCharsets.UTF_8));
        }
        JSONArray packs = index.getJSONArray("packages");
        for (int i = 0; i < packs.length(); i++) {
            JSONObject pack = packs.getJSONObject(i);
            bundled.put(pack.getJSONObject("manifest").getString("id"), pack);
        }
        effective.putAll(bundled);
        if (debug) {
            if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create development package directory");
            try (InputStream input = registryFile.openRead()) {
                registry = new JSONObject(new String(read(input, 1024 * 1024), StandardCharsets.UTF_8));
            } catch (Exception error) { registry = new JSONObject(); }
            recover();
            consumeImport();
            refreshEffective();
            cleanup();
            writeStatus();
        }
        JSONArray result = new JSONArray();
        for (JSONObject pack : effective.values()) result.put(pack);
        index.put("packages", result);
        return index;
    }

    void acknowledge() throws Exception {
        if (debug && receipt != null) atomicJson(new File(context.getFilesDir(), "genesis-applet-receipt.json"), receipt);
    }

    InputStream open(String name) throws Exception {
        if (!safePath(name)) throw new IOException("Unsafe package path");
        String[] parts = name.split("/", 4);
        if (parts.length != 4 || !"packages".equals(parts[0])) throw new IOException("Invalid package path");
        JSONObject pack = effective.get(parts[1]);
        if (pack == null || !pack.getString("revision").equals(parts[2])) throw new IOException("Retired or undeclared revision");
        JSONObject ref = locations.get(parts[1]);
        if (debug && ref != null && "development".equals(ref.getString("kind"))) {
            return new FileInputStream(inside(revisionDirectory(parts[1], parts[2]), "assets/" + parts[3]));
        }
        return context.getAssets().open(name);
    }

    private void recover() throws Exception {
        List<String> ids = keys(registry);
        for (String id : ids) {
            JSONObject record = registry.optJSONObject(id);
            JSONObject current = record == null ? null : record.optJSONObject("current");
            if (resolve(id, current) != null) continue;
            JSONObject previous = record == null ? null : record.optJSONObject("previous");
            if (resolve(id, previous) != null) registry.put(id, new JSONObject().put("current", previous).put("previous", JSONObject.NULL));
            else registry.remove(id); // The bundled version, if present, stays available.
        }
        saveRegistry();
        refreshEffective();
    }

    private void refreshEffective() throws Exception {
        effective.clear(); effective.putAll(bundled); locations.clear();
        for (String id : keys(registry)) {
            JSONObject ref = registry.getJSONObject(id).getJSONObject("current");
            JSONObject pack = resolve(id, ref);
            if (pack != null) { effective.put(id, pack); locations.put(id, ref); }
        }
    }

    private JSONObject resolve(String id, JSONObject ref) {
        try {
            if (!id.matches("[a-z][a-z0-9-]{0,63}") || ref == null) return null;
            String revision = ref.getString("revision");
            if (!revision.matches("[a-f0-9]{64}")) return null;
            if ("bundled".equals(ref.getString("kind"))) {
                JSONObject pack = bundled.get(id);
                return pack != null && revision.equals(pack.getString("revision")) ? pack : null;
            }
            if (!"development".equals(ref.getString("kind"))) return null;
            File directory = revisionDirectory(id, revision);
            JSONObject bundle = readJson(inside(directory, "bundle.json"), 1024 * 1024);
            validateMetadata(bundle);
            JSONObject pack = bundle.getJSONObject("package");
            if (!id.equals(pack.getJSONObject("manifest").getString("id")) || !revision.equals(pack.getString("revision"))) return null;
            Set<String> expected = new HashSet<>(); expected.add("bundle.json");
            JSONArray assets = pack.getJSONArray("assets"); int total = 0;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject asset = assets.getJSONObject(i); String path = "assets/" + asset.getString("path");
                byte[] bytes;
                try (InputStream input = new FileInputStream(inside(directory, path))) { bytes = read(input, MAX_FILE); }
                total += bytes.length;
                if (total > MAX_TOTAL || !hash(bytes).equals(asset.getString("sha256"))) return null;
                expected.add(path);
            }
            if (!expected.equals(files(directory, ""))) return null;
            return new JSONObject(pack.toString()).put("runtimeApiVersion", bundle.getInt("runtimeApiVersion"));
        } catch (Exception error) { return null; }
    }

    private void consumeImport() throws Exception {
        File file = new File(context.getFilesDir(), "genesis-applet-import.json");
        if (!file.isFile()) return;
        String requestId = "invalid";
        JSONObject oldRegistry = new JSONObject(registry.toString());
        try {
            JSONObject request = readJson(file, MAX_ENVELOPE);
            requestId = request.getString("requestId");
            if (!UUID.fromString(requestId).toString().equals(requestId)) throw failure("INVALID_PACKAGE", "Invalid request identity");
            String action = request.getString("action");
            JSONObject pack;
            if ("install".equals(action)) pack = install(request);
            else if ("rollback".equals(action)) pack = rollback(request);
            else throw failure("INVALID_PACKAGE", "Unsupported package operation");
            receipt = new JSONObject().put("requestId", requestId).put("ok", true)
                .put("appletId", pack.getJSONObject("manifest").getString("id")).put("revision", pack.getString("revision"));
        } catch (Exception error) {
            registry = oldRegistry;
            // A failed candidate never changes the registry pointer.
            receipt = new JSONObject().put("requestId", requestId).put("ok", false)
                .put("error", new JSONObject().put("code", error instanceof PackageFailure ? ((PackageFailure) error).code : "INVALID_PACKAGE")
                    .put("message", error instanceof PackageFailure ? error.getMessage() : "Development package rejected; previous code and data preserved"));
        } finally { Files.deleteIfExists(file.toPath()); }
    }

    private JSONObject install(JSONObject request) throws Exception {
        fields(request, "requestId", "action", "expectedCurrentRevision", "intent", "formatVersion", "runtimeApiVersion", "sdkVersion", "package", "files");
        JSONObject bundle = new JSONObject();
        for (String key : new String[]{"formatVersion", "runtimeApiVersion", "sdkVersion", "package"}) bundle.put(key, request.get(key));
        validateMetadata(bundle);
        JSONObject pack = bundle.getJSONObject("package"), manifest = pack.getJSONObject("manifest");
        String id = manifest.getString("id"), revision = pack.getString("revision");
        JSONObject current = effective.get(id);
        checkExpected(request, current);
        JSONObject intent = request.getJSONObject("intent"); fields(intent, "replace", "allowPermissionChange");
        if (!(intent.get("replace") instanceof Boolean) || !(intent.get("allowPermissionChange") instanceof Boolean)) throw failure("INVALID_PACKAGE", "Invalid replacement intent");
        boolean different = current != null && !revision.equals(current.getString("revision"));
        if (different && !intent.getBoolean("replace")) throw failure("REPLACEMENT_REQUIRED", "Use explicit replacement intent for an existing applet");
        if (different && !permissions(current.getJSONObject("manifest")).equals(permissions(manifest)) && !intent.getBoolean("allowPermissionChange")) throw failure("PERMISSION_CHANGE", "Declared permissions changed; explicit permission-change intent required");
        JSONArray encoded = request.getJSONArray("files"), assets = pack.getJSONArray("assets");
        if (encoded.length() != assets.length()) throw failure("INVALID_PACKAGE", "Asset set does not match declaration");
        Map<String, String> hashes = new HashMap<>();
        for (int i = 0; i < assets.length(); i++) { JSONObject asset = assets.getJSONObject(i); hashes.put(asset.getString("path"), asset.getString("sha256")); }
        Map<String, byte[]> decoded = new LinkedHashMap<>(); int total = 0;
        for (int i = 0; i < encoded.length(); i++) {
            JSONObject asset = encoded.getJSONObject(i); fields(asset, "path", "base64");
            String path = asset.getString("path"), value = asset.getString("base64");
            if (!safePath(path) || !hashes.containsKey(path) || decoded.containsKey(path) || value.length() > (MAX_FILE + 2) / 3 * 4) throw failure("INVALID_PACKAGE", "Invalid or duplicate encoded asset");
            byte[] bytes = Base64.decode(value, Base64.NO_WRAP);
            if (!Base64.encodeToString(bytes, Base64.NO_WRAP).equals(value)) throw failure("INVALID_PACKAGE", "Non-canonical asset encoding");
            total += bytes.length;
            if (bytes.length > MAX_FILE || total > MAX_TOTAL || !hash(bytes).equals(hashes.get(path))) throw failure("INVALID_PACKAGE", "Asset size or integrity mismatch");
            decoded.put(path, bytes);
        }
        File staging = new File(root, "staging-" + UUID.randomUUID());
        if (!staging.mkdir()) throw new IOException("Cannot create staging directory");
        try {
            writeSynced(inside(staging, "bundle.json"), bundle.toString().getBytes(StandardCharsets.UTF_8));
            for (Map.Entry<String, byte[]> asset : decoded.entrySet()) writeSynced(inside(staging, "assets/" + asset.getKey()), asset.getValue());
            File destination = revisionDirectory(id, revision);
            if (!destination.getParentFile().isDirectory() && !destination.getParentFile().mkdirs()) throw new IOException("Cannot create applet directory");
            if (destination.exists()) {
                if (resolve(id, reference("development", revision)) == null) throw failure("INVALID_PACKAGE", "An invalid immutable revision already exists");
            } else if (!staging.renameTo(destination)) throw new IOException("Cannot commit revision directory");
            if (current == null || different) {
                JSONObject previous = current == null ? null : currentReference(id, current);
                registry.put(id, new JSONObject().put("current", reference("development", revision)).put("previous", previous == null ? JSONObject.NULL : previous));
                saveRegistry();
            }
        } finally { deleteTree(staging); }
        return pack;
    }

    private JSONObject rollback(JSONObject request) throws Exception {
        fields(request, "requestId", "action", "appletId", "expectedCurrentRevision");
        String id = request.getString("appletId"); JSONObject current = effective.get(id); checkExpected(request, current);
        JSONObject record = registry.optJSONObject(id), previous = record == null ? null : record.optJSONObject("previous");
        JSONObject pack = resolve(id, previous);
        if (pack == null) throw failure("NO_PREVIOUS_REVISION", "No compatible previous revision is available");
        JSONObject old = record.getJSONObject("current"); record.put("current", previous).put("previous", old); saveRegistry();
        return pack;
    }

    private void checkExpected(JSONObject request, JSONObject current) throws Exception {
        Object expected = request.get("expectedCurrentRevision");
        String actual = current == null ? null : current.getString("revision");
        if (actual == null ? expected != JSONObject.NULL : !actual.equals(expected)) throw failure("STALE_REVISION", "Applet changed since status was read; read status before retrying");
    }
    private JSONObject currentReference(String id, JSONObject pack) throws Exception {
        return locations.containsKey(id) ? locations.get(id) : reference("bundled", pack.getString("revision"));
    }
    private static JSONObject reference(String kind, String revision) throws Exception { return new JSONObject().put("kind", kind).put("revision", revision); }
    private void saveRegistry() throws Exception { atomicJson(registryFile, registry); }

    private void writeStatus() throws Exception {
        JSONArray entries = new JSONArray();
        for (Map.Entry<String, JSONObject> entry : effective.entrySet()) {
            String id = entry.getKey(); JSONObject pack = entry.getValue(), manifest = pack.getJSONObject("manifest");
            JSONObject record = registry.optJSONObject(id), previous = record == null ? null : record.optJSONObject("previous");
            JSONObject permissions = permissionObject(manifest);
            entries.put(new JSONObject().put("id", id).put("revision", pack.getString("revision"))
                .put("originKind", locations.containsKey(id) ? locations.get(id).getString("kind") : "bundled")
                .put("previousRevision", previous == null ? JSONObject.NULL : previous.getString("revision"))
                .put("origins", permissions.getJSONArray("origins")).put("capabilities", permissions.getJSONArray("capabilities")).put("services", permissions.getJSONArray("services")));
        }
        atomicJson(new File(context.getFilesDir(), "genesis-applet-status.json"), new JSONObject()
            .put("runtimeApiVersion", 2).put("runtimeApiVersions", new JSONArray().put(1).put(2)).put("bundleFormatVersions", new JSONArray().put(1)).put("debug", true).put("applets", entries));
    }

    private static JSONObject permissionObject(JSONObject manifest) throws Exception {
        Set<String> origins = new HashSet<>(); JSONArray sources = manifest.getJSONArray("sources");
        for (int i = 0; i < sources.length(); i++) { JSONArray values = sources.getJSONObject(i).getJSONArray("origins"); for (int j = 0; j < values.length(); j++) origins.add(values.getString(j)); }
        return new JSONObject().put("origins", sorted(origins)).put("capabilities", sorted(strings(manifest.getJSONArray("capabilities"))))
            .put("services", sorted(strings(manifest.optJSONArray("services"))));
    }
    private static String permissions(JSONObject manifest) throws Exception { return canonical(permissionObject(manifest)); }
    private static Set<String> strings(JSONArray values) throws Exception { Set<String> result = new HashSet<>(); if (values != null) for (int i = 0; i < values.length(); i++) result.add(values.getString(i)); return result; }
    private static JSONArray sorted(Set<String> values) { List<String> list = new ArrayList<>(values); Collections.sort(list); return new JSONArray(list); }

    private static void validateMetadata(JSONObject bundle) throws Exception {
        fields(bundle, "formatVersion", "runtimeApiVersion", "sdkVersion", "package");
        String validation = NativeBridge.validateBundle(bundle.toString());
        if (!"ok".equals(validation)) throw failure("INCOMPATIBLE_PACKAGE", validation);
        JSONObject pack = bundle.getJSONObject("package");
        JSONObject body = new JSONObject().put("formatVersion", bundle.get("formatVersion")).put("runtimeApiVersion", bundle.get("runtimeApiVersion"))
            .put("sdkVersion", bundle.get("sdkVersion")).put("manifest", pack.getJSONObject("manifest")).put("assets", pack.getJSONArray("assets"));
        if (!hash(canonical(body).getBytes(StandardCharsets.UTF_8)).equals(pack.getString("revision"))) throw failure("INVALID_PACKAGE", "Canonical package revision mismatch");
    }

    private void cleanup() throws Exception {
        File[] children = root.listFiles(); if (children == null) return;
        for (File child : children) {
            if (child.getName().startsWith("staging-")) { deleteTree(child); continue; }
            if (!child.isDirectory() || !child.getName().matches("[a-z][a-z0-9-]{0,63}")) continue;
            Set<String> keep = new HashSet<>(); JSONObject record = registry.optJSONObject(child.getName());
            if (record != null) for (String key : new String[]{"current", "previous"}) { JSONObject ref = record.optJSONObject(key); if (ref != null && "development".equals(ref.optString("kind"))) keep.add(ref.getString("revision")); }
            File[] revisions = child.listFiles(); if (revisions != null) for (File revision : revisions) if (revision.getName().matches("[a-f0-9]{64}") && !keep.contains(revision.getName())) deleteTree(revision);
        }
    }
    private File revisionDirectory(String id, String revision) throws Exception {
        if (!id.matches("[a-z][a-z0-9-]{0,63}") || !revision.matches("[a-f0-9]{64}")) throw new IOException("Unsafe package identity");
        return inside(root, id + "/" + revision);
    }
    private static boolean safePath(String path) {
        if (path.isEmpty() || path.startsWith("/") || path.contains("\\") || path.indexOf(0) >= 0) return false;
        for (String part : path.split("/", -1)) if (part.isEmpty() || ".".equals(part) || "..".equals(part)) return false;
        return true;
    }
    private static File inside(File base, String path) throws Exception {
        if (!safePath(path)) throw new IOException("Unsafe relative path");
        File result = new File(base, path);
        if (!result.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator)) throw new IOException("Path escapes package directory");
        return result;
    }
    private void deleteTree(File file) throws Exception {
        if (!file.exists()) return;
        if (Files.isSymbolicLink(file.toPath()) || !file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator)) throw new IOException("Unsafe package cleanup path");
        File[] children = file.listFiles(); if (children != null) for (File child : children) deleteTree(child);
        if (!file.delete()) throw new IOException("Cannot remove unused package file");
    }
    private static Set<String> files(File directory, String prefix) throws Exception {
        Set<String> names = new HashSet<>(); File[] children = directory.listFiles(); if (children == null) throw new IOException("Missing package directory");
        for (File child : children) {
            if (Files.isSymbolicLink(child.toPath())) throw new IOException("Package symlink rejected");
            if (child.isDirectory()) names.addAll(files(child, prefix + child.getName() + "/"));
            else if (child.isFile()) names.add(prefix + child.getName()); else throw new IOException("Nonregular package file");
        }
        return names;
    }
    private static JSONObject readJson(File file, int limit) throws Exception { try (InputStream input = new FileInputStream(file)) { return new JSONObject(new String(read(input, limit), StandardCharsets.UTF_8)); } }
    private static byte[] read(InputStream input, int limit) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > limit) throw new IOException("Package exceeds byte limit"); bytes.write(buffer, 0, count); }
        return bytes.toByteArray();
    }
    private static void writeSynced(File file, byte[] bytes) throws Exception {
        File parent = file.getParentFile(); if (!parent.isDirectory() && !parent.mkdirs()) throw new IOException("Cannot create package asset directory");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); output.getFD().sync(); }
    }
    private static void atomicJson(File file, JSONObject value) throws Exception { atomicJson(new AtomicFile(file), value); }
    private static void atomicJson(AtomicFile file, JSONObject value) throws Exception {
        FileOutputStream output = null;
        try { output = file.startWrite(); output.write(value.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(output); }
        catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
    }
    private static void fields(JSONObject value, String... fields) throws Exception {
        Set<String> allowed = new HashSet<>(java.util.Arrays.asList(fields));
        if (!allowed.equals(new HashSet<>(keys(value)))) throw failure("INVALID_PACKAGE", "Missing or unknown package field");
    }
    private static List<String> keys(JSONObject value) { List<String> keys = new ArrayList<>(); Iterator<String> iterator = value.keys(); while (iterator.hasNext()) keys.add(iterator.next()); Collections.sort(keys); return keys; }
    private static String hash(byte[] bytes) throws Exception { StringBuilder result = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(bytes)) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255)); return result.toString(); }

    /** JSON.stringify-compatible strings, including unpaired surrogate escaping. */
    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': out.append("\\\""); break;
                case '\\': out.append("\\\\"); break;
                case '\b': out.append("\\b"); break;
                case '\t': out.append("\\t"); break;
                case '\n': out.append("\\n"); break;
                case '\f': out.append("\\f"); break;
                case '\r': out.append("\\r"); break;
                default:
                    boolean lone = Character.isHighSurrogate(c) ? i + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(i + 1)) : Character.isLowSurrogate(c) && (i == 0 || !Character.isHighSurrogate(value.charAt(i - 1)));
                    if (c < 32 || lone) out.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) c)); else out.append(c);
            }
        }
        return out.append('"').toString();
    }
    private static String canonical(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) { JSONObject object = (JSONObject) value; List<String> items = new ArrayList<>(); for (String key : keys(object)) items.add(quote(key) + ":" + canonical(object.get(key))); return "{" + String.join(",", items) + "}"; }
        if (value instanceof JSONArray) { JSONArray array = (JSONArray) value; List<String> items = new ArrayList<>(); for (int i = 0; i < array.length(); i++) items.add(canonical(array.get(i))); return "[" + String.join(",", items) + "]"; }
        if (value instanceof String) return quote((String) value);
        return value.toString();
    }
    private static PackageFailure failure(String code, String message) { return new PackageFailure(code, message); }
    private static final class PackageFailure extends IOException {
        final String code;
        PackageFailure(String code, String message) { super(message); this.code = code; }
    }
}
