# Genesis product intent

Genesis is a browser-like customization platform for phones. Users run websites and install or develop customizations that own their frontend behavior and, where needed, their backend. Creators can keep backend source beside frontend source in an applet directory and operate the backend as a separate server process.

Website state, applet application data and Genesis platform state have separate owners. New application data models and server routes should not require changes to the Rust host. The host supplies general capabilities and native recovery.

Ordinary DOM/CSS customization and optional React UI are the current approach. A pure Source DOM plus React to Result DOM function does not reproduce a website's complete running behavior. An engine fork, complete source mirror and mandatory dual-WebView design are not current requirements. Backend use is optional for simple customizations.

Performance, supported websites, isolation, distribution and offline behavior require specific evidence. Local execution alone does not guarantee browser-equivalent performance.

Read [architecture](../.architecture/README.md) and [research](../.research/README.md). Earlier product brainstorming is available in the working history; this is the current product direction.
