package app.nirvana.genesis;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the user let each website of one profile use. Android's own permission is asked
 * separately; this records the user's answer to Genesis's question, so a site asks only once.
 */
public final class SiteGrants {
    public static final String CAMERA = "camera";
    public static final String MICROPHONE = "microphone";
    public static final String LOCATION = "location";
    private static final String[] ALL = { CAMERA, MICROPHONE, LOCATION };
    private static final String ALLOW = "allow", DENY = "deny";

    private final SharedPreferences prefs;
    private final String profile;

    SiteGrants(Context context, String profile) {
        this.prefs = context.getSharedPreferences("genesis-site-grants", Context.MODE_PRIVATE);
        this.profile = profile;
    }

    private String key(String origin, String permission) { return profile + "\n" + origin + "\n" + permission; }

    /** True when allowed, false when refused, null when the site never asked. */
    Boolean get(String origin, String permission) {
        String value = prefs.getString(key(origin, permission), null);
        return value == null ? null : ALLOW.equals(value);
    }

    void set(String origin, String permission, boolean allowed) {
        prefs.edit().putString(key(origin, permission), allowed ? ALLOW : DENY).apply();
    }

    /** The answers recorded for one origin, as Settings shows them: "Camera allowed, location blocked". Null when none. */
    public String describe(String origin) {
        List<String> parts = new ArrayList<>();
        for (String permission : ALL) {
            Boolean allowed = get(origin, permission);
            if (allowed != null) parts.add(permission + (allowed ? " allowed" : " blocked"));
        }
        if (parts.isEmpty()) return null;
        String text = String.join(", ", parts);
        return Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    /** Forgets this origin's answers, so the site asks again. */
    public void clear(String origin) {
        SharedPreferences.Editor editor = prefs.edit();
        for (String permission : ALL) editor.remove(key(origin, permission));
        editor.apply();
    }

    /** Forgets every answer of this profile. */
    void clearAll() {
        SharedPreferences.Editor editor = prefs.edit();
        for (Map.Entry<String, ?> entry : new LinkedHashMap<>(prefs.getAll()).entrySet()) {
            if (entry.getKey().startsWith(profile + "\n")) editor.remove(entry.getKey());
        }
        editor.apply();
    }
}
