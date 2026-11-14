package app.nirvana.genesis;

import android.net.Uri;
import android.view.View;
import java.util.function.Consumer;

/**
 * What a website asks the shell for, in types that do not depend on the website engine. Each
 * engine wraps its own callback objects in these, so the shell answers every engine the same way.
 */
final class Requests {
    private Requests() {}

    /** A website's file input. `deliver` answers once; later answers are ignored. */
    static final class FileRequest {
        /** The input's `accept` values as the page wrote them, such as `image/*` or `.pdf`. */
        final String[] acceptTypes;
        final boolean multiple;
        /** False for a request Genesis does not serve, such as saving a file. */
        final boolean open;
        private Consumer<Uri[]> result;

        FileRequest(String[] acceptTypes, boolean multiple, boolean open, Consumer<Uri[]> result) {
            this.acceptTypes = acceptTypes == null ? new String[0] : acceptTypes;
            this.multiple = multiple;
            this.open = open;
            this.result = result;
        }

        /** The chosen files, or null for none. */
        void deliver(Uri[] files) {
            Consumer<Uri[]> pending = result;
            result = null;
            if (pending != null) pending.accept(files);
        }

        void cancel() { deliver(null); }
    }

    /** A website's element shown full screen, such as a video. `exit` tells the website it closed. */
    static final class FullScreen {
        /** The page whose website went full screen. */
        final Views.Page page;
        final View view;
        private Runnable hidden;

        FullScreen(Views.Page page, View view, Runnable hidden) {
            this.page = page;
            this.view = view;
            this.hidden = hidden;
        }

        void exit() {
            Runnable pending = hidden;
            hidden = null;
            if (pending != null) pending.run();
        }
    }

    /** A server's own username and password prompt (HTTP authentication). */
    interface AuthRequest {
        void proceed(String user, String password);
        void cancel();
    }

    /** A website's JavaScript dialog (`alert`, `confirm`, `prompt` or `beforeunload`) waiting for its answer. */
    interface DialogResult {
        /** OK; `value` is a prompt's text and null for the other kinds. */
        void confirm(String value);
        void cancel();
    }
}
