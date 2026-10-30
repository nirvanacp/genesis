# Hacker News applet

This applet adapts Hacker News while preserving its real login/forms and source links. Home, Post, and Me are source sections; Search is an intentional local placeholder; Saved is an owned React page. Bookmarks/categories live on the applet-owned HTTPS service. Public account identity and Post drafts use optional applet-scoped host documents; credentials stay in WebView/native service storage.

Follow [factory instructions](../../AGENTS.md). From the Genesis root use workspace typecheck, selected package validation, and the shared build tooling. Service start is explicit through genesis-applet service start with this directory and an authorized device, or the root compatibility wrapper. Runtime API 1 and SDK/tools 0.2.0 are required. Use an install-as-update host workflow to preserve hn-bookmarks identity and data.

The backend is a personal single-token/single-database server, not a multi-user account system. Production requires trusted HTTPS, durable storage, backups, and managed credentials. No Node runtime is bundled in Android. Supported source routes and shell destinations are enumerated in applet.json. Real HN posting is never a routine verification action; its authorized prelaunch check remains separate.
