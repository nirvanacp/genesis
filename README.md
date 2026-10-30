# Project Nirvana

Genesis is an Android browser customization platform. Creator JS/TS and optional React code modify live websites. Creators own their application data and optional backends. Rust owns generic host policy and lifecycle; Android owns WebView and native integration.

Start with [architecture](.architecture/README.md), [research](.research/phase-2/README.md), [product intent](.notes/README.md), [Android setup](.docs/phase-2/2026-10-27/161510-genesis-android-setup.md) and [HN backend operations](.docs/phase-2/2026-10-27/200113-genesis-hacker-news-mvp-guide.md). Plans ending in .archive.md are historical and must not guide new implementation.

Only HN is bundled. Its frontend is under applets/news.ycombinator.com/src and its separately operated Node/SQLite backend is under applets/news.ycombinator.com/backend. Configure the backend through native Menu > Service connections. Server records require connectivity. Existing device bookmarks are preserved but not automatically uploaded. Generic Genesis local storage remains optional infrastructure.

The previous local-storage emulator MVP passed its recorded checks. The new backend path requires separate Android HTTPS workflow qualification; prior reports do not establish it. X/YouTube and the earlier Wasm page runtime remain preserved and inactive. Independent applet installation and on-phone backend execution remain future capabilities.

We're building a daily-driver on steroids. This project is trying to solve the following problems:

### 1. Automation that works:

OpenAI, Meta, and SpaceX have recently launched some form of a 'bot'. Our hot take is that it'll eventually converge into a phone with Siri on steroids. But at the same time, I'd not put my money on either Apple or Google to make it happen.

ChatGPT or Grok have not yet broken the limitations of a mobile app when it comes to a handheld use-case, and an interface shaped like a keychain is just tragic. There's a huge demand which has not yet been fulfilled, and that's one of the problems we want to solve.

### 2. Software Customization:

When you used a Linux distro for the first time in your life, you signed up to be among the top 1% of power users who can take control of what they see on their screen. In 2026, where everyone's a vibecoder, we firmly believe it's time to bring this luxury to the rest of us.

### 3. Security:

Today, we're in a cat-and-mouse catch-up game when it comes to security; there's no denying that.

One of our primary goals is to enable our users to take control of the code that runs their lives. And if they don't know the code you're running, it becomes harder for them to exploit it.


### Summary:

The amount of code that runs the world is growing exponentially, and only so much of it can be useful in our day-to-day lives. The general economics of it indicates that we are moving towards a future where two people using the same phone run different software stacks that they have ownership of. That's a world we'd like to live in, and we are building for that future.
