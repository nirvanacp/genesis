package app.nirvana.genesis;

import android.os.Handler;
import android.os.Looper;
import java.lang.ref.WeakReference;
import java.util.concurrent.Semaphore;

/** UI reducer plus the bounded, process-lifetime Rust storage and servelet workers. */
public final class NativeBridge {
    interface StorageResults {
        void receive(String result);
        /** A shell event from the servelet worker, already on the UI thread. */
        void receiveEvent(String eventJson);
    }
    static { System.loadLibrary("genesis_host"); }
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final Semaphore COMPLETIONS = new Semaphore(64);
    private static WeakReference<StorageResults> receiver = new WeakReference<>(null);
    private NativeBridge() {}
    static void attach(StorageResults value) { receiver = new WeakReference<>(value); }
    static void detach(StorageResults value) { if (receiver.get() == value) receiver.clear(); }
    // Called from the worker. No Activity is retained by Rust or by a queued completion.
    public static void onStorageResult(String result) {
        try {
            COMPLETIONS.acquire();
            MAIN.post(() -> {
                try { StorageResults target = receiver.get(); if (target != null) target.receive(result); }
                finally { COMPLETIONS.release(); }
            });
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
    }
    // Called from the servelet worker with the JSON of a `ServiceResponse` or `ServiceFailed` event.
    public static void onServeletResult(String eventJson) {
        try {
            COMPLETIONS.acquire();
            MAIN.post(() -> {
                try { StorageResults target = receiver.get(); if (target != null) target.receiveEvent(eventJson); }
                finally { COMPLETIONS.release(); }
            });
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
    }
    public static native String dispatch(String eventJson);
    public static native String configureStorage(String directory);
}
