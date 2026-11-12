package app.nirvana.genesis;

import android.os.SystemClock;
import android.view.InputDevice;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Real Android input for a hidden context's WebView, for the page agent's trusted input. The
 * events reach the page as trusted DOM events with user activation, while the WebView stays
 * unfocused under the foreground, so the soft keyboard stays closed and the user's own touches
 * keep going to the foreground. Gesture rules depend on the page being revealed, and the shell
 * never sends this input to a revealed page. Its activation can outlast a reveal, so for a few
 * seconds after it the page's gestures do not count as the user's (`SitePolicy.usersGesture`).
 *
 * Points arrive in CSS pixels of the visual viewport at scale 1 (the page agent applies the page
 * zoom), so a view pixel is that times the display density.
 *
 * Input never reaches the clipboard: `Control` or `Meta` with a character key (copy, cut, paste,
 * select all, undo) and `Shift+Delete` (cut) are refused, so a hidden page can neither read the
 * user's clipboard into a field nor overwrite it.
 */
final class Input {
    private Input() {}

    private static final KeyCharacterMap KEYS = KeyCharacterMap.load(KeyCharacterMap.VIRTUAL_KEYBOARD);
    /**
     * Characters of text in one batch. Each one becomes key events dispatched on the UI thread, so
     * a long text would freeze the app. The host refuses longer text first, with the same limit.
     */
    static final int TEXT_MAX = 2000;
    /** How long a tap's finger stays down, in ms of event time. */
    private static final long TAP_MS = 50;
    /** The last hover point of each view, in view pixels, while the mouse is over it. */
    private static final Map<View, float[]> hovering = new WeakHashMap<>();

    /** Thrown for an event the shell cannot dispatch; nothing of the batch has been dispatched. */
    static final class Refused extends Exception {
        Refused(String message) { super(message); }
    }

    /**
     * Converts every event first and dispatches only when all of them can be, in order, on the UI
     * thread. Throws `Refused` without dispatching anything when one cannot.
     */
    static void dispatch(View web, JSONArray events) throws Refused {
        float density = web.getResources().getDisplayMetrics().density;
        List<Runnable> steps = new ArrayList<>();
        int text = 0;
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.optJSONObject(i);
            if (event == null) throw new Refused("An input event is not an object");
            if ("text".equals(event.optString("type"))) {
                String typed = event.optString("text");
                text += typed.codePointCount(0, typed.length());
            }
            if (text > TEXT_MAX) throw new Refused("Trusted input types at most " + TEXT_MAX + " characters");
            steps.add(step(web, event, density));
        }
        for (Runnable step : steps) step.run();
    }

    private static Runnable step(View web, JSONObject event, float density) throws Refused {
        String type = event.optString("type");
        switch (type) {
            case "tap": {
                float[] at = point(web, event, density);
                return () -> tap(web, at[0], at[1]);
            }
            case "hover": {
                float[] at = point(web, event, density);
                return () -> hover(web, at[0], at[1]);
            }
            case "hoverExit":
                return () -> hoverExit(web);
            case "key": {
                List<KeyEvent> keys = key(event.optString("key"), modifiers(event.optJSONArray("modifiers")));
                return () -> keys(web, keys);
            }
            case "text": {
                String text = event.optString("text");
                KeyEvent[] keys = text.isEmpty() ? new KeyEvent[0] : KEYS.getEvents(text.toCharArray());
                if (keys == null) throw new Refused("This text has characters that cannot be typed as keys");
                List<KeyEvent> list = new ArrayList<>(List.of(keys));
                return () -> keys(web, list);
            }
            default:
                throw new Refused("Unknown input event " + type);
        }
    }

    private static float[] point(View web, JSONObject event, float density) throws Refused {
        double x = event.optDouble("x", Double.NaN);
        double y = event.optDouble("y", Double.NaN);
        float viewX = (float) (x * density);
        float viewY = (float) (y * density);
        if (Double.isNaN(x) || Double.isNaN(y) || viewX < 0 || viewY < 0 || viewX >= web.getWidth() || viewY >= web.getHeight()) {
            throw new Refused("The point is outside the page");
        }
        return new float[] { viewX, viewY };
    }

    private static void tap(View web, float x, float y) {
        long now = SystemClock.uptimeMillis();
        touch(web, now, now, MotionEvent.ACTION_DOWN, x, y);
        touch(web, now, now + TAP_MS, MotionEvent.ACTION_UP, x, y);
    }

    private static void touch(View web, long down, long time, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, time, action, x, y, 0);
        event.setSource(InputDevice.SOURCE_TOUCHSCREEN);
        web.dispatchTouchEvent(event);
        event.recycle();
    }

    private static void hover(View web, float x, float y) {
        if (!hovering.containsKey(web)) mouse(web, MotionEvent.ACTION_HOVER_ENTER, x, y);
        mouse(web, MotionEvent.ACTION_HOVER_MOVE, x, y);
        hovering.put(web, new float[] { x, y });
    }

    /**
     * WebView ignores `ACTION_HOVER_EXIT` on its own, so the mouse first moves just outside the
     * view, which makes the page see it leave, and then exits there.
     */
    private static void hoverExit(View web) {
        if (hovering.remove(web) == null) return;
        mouse(web, MotionEvent.ACTION_HOVER_MOVE, -1, -1);
        mouse(web, MotionEvent.ACTION_HOVER_EXIT, -1, -1);
    }

    /** A mouse event without buttons. WebView handles it even though the call returns false. */
    private static void mouse(View web, int action, float x, float y) {
        MotionEvent.PointerProperties[] properties = { new MotionEvent.PointerProperties() };
        properties[0].id = 0;
        properties[0].toolType = MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords[] coords = { new MotionEvent.PointerCoords() };
        coords[0].x = x;
        coords[0].y = y;
        long now = SystemClock.uptimeMillis();
        MotionEvent event = MotionEvent.obtain(now, now, action, 1, properties, coords, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_MOUSE, 0);
        web.dispatchGenericMotionEvent(event);
        event.recycle();
    }

    private static void keys(View web, List<KeyEvent> keys) {
        for (KeyEvent key : keys) web.dispatchKeyEvent(key);
    }

    /** Down and up for one key by its DOM `key` name, with the modifiers held. */
    private static List<KeyEvent> key(String name, int meta) throws Refused {
        int code = named(name);
        if (code == KeyEvent.KEYCODE_FORWARD_DEL && (meta & KeyEvent.META_SHIFT_ON) != 0) {
            throw new Refused("Shift+Delete cuts to the clipboard, which trusted input may not use");
        }
        if (code == KeyEvent.KEYCODE_UNKNOWN) {
            if (name.codePointCount(0, name.length()) != 1) throw new Refused("Unknown key " + name);
            if ((meta & (KeyEvent.META_CTRL_ON | KeyEvent.META_META_ON)) != 0) {
                throw new Refused("Control or Meta with a character key is a shortcut, such as the clipboard's, which trusted input may not use");
            }
            KeyEvent[] events = KEYS.getEvents(name.toCharArray());
            if (events == null) throw new Refused("The key " + name + " cannot be typed");
            List<KeyEvent> list = new ArrayList<>();
            for (KeyEvent e : events) {
                list.add(meta == 0 ? e : new KeyEvent(e.getDownTime(), e.getEventTime(), e.getAction(), e.getKeyCode(), e.getRepeatCount(),
                    e.getMetaState() | meta, e.getDeviceId(), e.getScanCode(), e.getFlags(), e.getSource()));
            }
            return list;
        }
        long now = SystemClock.uptimeMillis();
        return List.of(
            new KeyEvent(now, now, KeyEvent.ACTION_DOWN, code, 0, meta),
            new KeyEvent(now, now, KeyEvent.ACTION_UP, code, 0, meta));
    }

    private static int named(String name) {
        switch (name) {
            case "Enter": return KeyEvent.KEYCODE_ENTER;
            case "Tab": return KeyEvent.KEYCODE_TAB;
            case "Escape": return KeyEvent.KEYCODE_ESCAPE;
            case "Backspace": return KeyEvent.KEYCODE_DEL;
            case "Delete": return KeyEvent.KEYCODE_FORWARD_DEL;
            case " ": return KeyEvent.KEYCODE_SPACE;
            case "ArrowUp": return KeyEvent.KEYCODE_DPAD_UP;
            case "ArrowDown": return KeyEvent.KEYCODE_DPAD_DOWN;
            case "ArrowLeft": return KeyEvent.KEYCODE_DPAD_LEFT;
            case "ArrowRight": return KeyEvent.KEYCODE_DPAD_RIGHT;
            case "Home": return KeyEvent.KEYCODE_MOVE_HOME;
            case "End": return KeyEvent.KEYCODE_MOVE_END;
            case "PageUp": return KeyEvent.KEYCODE_PAGE_UP;
            case "PageDown": return KeyEvent.KEYCODE_PAGE_DOWN;
            default: return KeyEvent.KEYCODE_UNKNOWN;
        }
    }

    private static int modifiers(JSONArray names) throws Refused {
        int meta = 0;
        for (int i = 0; names != null && i < names.length(); i++) {
            String name = names.optString(i);
            switch (name) {
                case "Shift": meta |= KeyEvent.META_SHIFT_ON | KeyEvent.META_SHIFT_LEFT_ON; break;
                case "Control": meta |= KeyEvent.META_CTRL_ON | KeyEvent.META_CTRL_LEFT_ON; break;
                case "Alt": meta |= KeyEvent.META_ALT_ON | KeyEvent.META_ALT_LEFT_ON; break;
                case "Meta": meta |= KeyEvent.META_META_ON | KeyEvent.META_META_LEFT_ON; break;
                default: throw new Refused("Unknown modifier " + name);
            }
        }
        return meta;
    }
}
