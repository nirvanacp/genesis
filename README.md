# Project Nirvana

The current Genesis prototype is a single **Hacker News bookmarking applet** for public pages at [news.ycombinator.com](https://news.ycombinator.com/). It requires no website login. The planned feature is local categorized story bookmarks with an offline library, preserving HN's original page and navigation.

MVP-01's Android build is verified. MVP-02's generic browser host and HN qualification entries are implemented; saving, categories and durable storage remain pending. Only `hn-bookmarks` is bundled. Earlier YouTube/X source directories remain intact as inactive npm workspaces.

Read the [MVP architecture](.plans/2026-10-27/150238-genesis-mvp-implementation-plan.md), [HN applet specification](.plans/2026-10-27/150238-genesis-hacker-news-applet-plan.md) and [ordered implementation prompts](.docs/2026-10-27/200113-genesis-hacker-news-mvp-guide.md). Open `android/` in Android Studio using the [setup guide](.docs/2026-10-27/161510-genesis-android-setup.md).

See the [HN retargeting report](.reports/2026-10-27/200924-genesis-hacker-news-retargeting-report.md) for the current build and launcher evidence. The [28 October qualification report](.reports/2026-10-28/162112-genesis-hn-wasm-qualification-report.md) records the updated Google provider: all required APIs are supported, but HN source startup refuses Wasm compilation. The local packaged page passes Wasm startup and 20 reloads. A page-runtime architecture decision remains pending. HN removes login dependence but does not remove those platform gates. The [earlier qualification report](.reports/2026-10-27/182114-genesis-mvp02-qualification-report.md) is historical evidence, not HN qualification. Background architecture research remains under [.research](.research/live-dom-customization/README.md).

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
