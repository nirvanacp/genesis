package app.nirvana.genesis;

/** UI-thread-only command boundary. No Activity or browser references enter Rust. */
public final class NativeBridge {
    static { System.loadLibrary("genesis_android"); }
    private NativeBridge() {}
    public static native String dispatch(String eventJson);
}
