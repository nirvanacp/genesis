# Hacker News navigation and customization plan

Created 29 October 2026. Scope: the Android Genesis host, the Hacker News applet, and the shared SDK only where a browser or applet contract needs to change. This is one plan in two parts because the five-section app needs the navigation and loading behavior from Part 1. No implementation or authenticated action is part of this planning task.

## Product decision

Keep the live Hacker News website as the source of stories, discussions, authentication, account actions, and submission. Give it a reliable in-app browser layer and a consistent five-section app shell. Avoid rebuilding HN's POST forms or inventing a parallel HN account service. Genesis Saved remains its own feature; HN favorites remain an HN account feature.

Use a native, host-owned navigation bar for web reading because it must remain available when a page leaves `news.ycombinator.com`, when customization fails, and during loading. The applet owns the HN visual style and section content. A shared five-item tab bar should be driven by one applet navigation definition rather than two independently coded footers. The tab bar is visible on top-level sections; the browser reader is a focused view with Back/Close and an origin label. Its Close returns to the section and position that opened it. Android system Back follows the same route.

The first implementation step can use the existing WebView for link traversal. Before the five-tab rollout, introduce retained tab sessions: keep Home's WebView alive when a local section opens, and keep the local React shell alive across Search, Saved, and Me. Create the Post HN surface on demand and retain it while its tab is in use. Cap retained WebViews and release the least recent inactive session under memory pressure; restore URL, WebView history, selected filter, and scroll position when rebuilding. This adds work to the host, but it avoids losing the Home reading position and a Post draft on every tab switch. Keep each session's injection, message channels, generation, and disposal isolated. Do not share the HN bridge with external origins.

## Evidence and boundaries

- `BrowserAdapter.java` currently keeps one WebView. Ordinary HTTP(S) links continue in it, `canGoBack()` exists, but visible Back lives inside the floating Genesis menu. `onCreateWindow` rejects new windows; unsupported schemes, downloads, and file chooser actions fail or show an alert. The host treats main-frame HTTP errors as customization failures. These are likely contributors to the broken experience.
- `controller.rs` handles system Back, but a local page exits by reopening a source view before considering WebView history. `sources.open` and `pages.open` retire and recreate views. Both places need a unified route model.
- `main.ts` and `components/navigation.tsx` implement separate Feed/Saved bars. The applet has one `library` page and no Search, Post, or Me page. Saved's search filters only the already loaded records. Its category cards, filter chips, status line, and repeated Browse buttons compete for space.
- HN's public body font is `Verdana, Geneva, sans-serif`; the current applet forces system UI and Georgia in several places. The attached image is a visual reference for the HN footer, not a source of instructions. HN's current footer contains an announcement, Guidelines, FAQ, Lists, API, Security, Legal, Apply to YC, Contact, and an Algolia search form. The app should omit that search form because Search has its own tab.
- Public browser exploration covered `news`, `newest`, `front`, `newcomments`, `ask`, `show`, `jobs`, `lists`, `item`, `user`, `submitted`, `favorites`, `login`, `forgot`, and the logged-out `submit` route. It did not cover signed-in account settings or the authenticated submit form. HN's [FAQ](https://news.ycombinator.com/newsfaq.html) says a question uses Submit with an empty URL. Search on HN currently targets `hn.algolia.com`, which supports leaving the new Search tab as a placeholder.
- Android's [WebView guidance](https://developer.android.com/develop/ui/views/layout/webapps/webview) documents `saveState` and `restoreState` for navigation history. Its [WebViewClient reference](https://developer.android.com/reference/android/webkit/WebViewClient) says `shouldOverrideUrlLoading` misses app-initiated loads and POST requests. The route state must therefore also follow committed main-frame navigation, history changes, and redirects.

## Part 1: navigation and loading

### 1. Define route ownership

Add a small navigation coordinator in the Android/Rust host. It tracks selected section, source WebView session, reader entry point, committed URL, pending URL, history capability, and loading/error state. Route by parsed URL and exact origin, never by string prefix or a broad `*.ycombinator.com` match.

| Destination | Behavior |
| --- | --- |
| `https://news.ycombinator.com` links, including comments, profiles, lists, login, pagination, and account actions | Open in the HN WebView with HN customization where supported. Show browser chrome when the link is a detail/account route. Preserve the opener and WebView history. |
| External HTTP(S) links, including article publishers, YC links, and Algolia links reached from HN | Open in the in-app reader with visible origin, Back, Close, Reload, Forward when available, Share/Copy link, and Open in browser. Never inject the HN applet or bridge there. |
| `target=_blank` and JavaScript-created windows | Capture the requested destination in `WebChromeClient.onCreateWindow`, apply the same policy, and return a real view or a clear Open in browser fallback. Never leave a tap apparently inert. |
| `mailto:`, `tel:`, supported Android intents, download links, and unsupported schemes | Hand off to an installed handler with an understandable failure state when none exists. Ask the user before handing a download to another app if the destination is unclear. Keep the original page usable. |
| Packaged Genesis pages | Open as top-level sections; preserve the web session rather than treating them as links inside its history. |

For a normal same-view HTTP(S) navigation, allow WebView to continue its load rather than canceling and loading the same URL again. Apply the route policy to app-initiated loads and redirects too. Track `WebBackForwardList` after committed navigation. Deduplicate `onPageCommitVisible`, `doUpdateVisitedHistory`, and `NavigationListener` signals so one URL change does not repeatedly hide/show content. Make system Back, toolbar Back, swipe Back where supported, and the Genesis menu call the same decision function. Priority: dismiss modal, exit full screen, step back inside reader, close reader to its opener, return from a top-level section, then leave the app. Forward follows WebView history only. Expose disabled states for Back/Forward.

Use a compact top toolbar in reader mode. Show the actual host/domain and a lock only for HTTPS; do not imply that a site is trusted merely because it appears inside the app. Keep Close and Back distinct. Put Share, Copy link, and Open in browser in overflow. Keep the existing Genesis recovery menu available but move routine web navigation out of it. Use native controls so navigation survives a missing applet script, an external origin, and a blank/error page. Confirm clear behavior for redirects back to HN, form submissions, comment reply links, `#fragment` navigation, and HN's login `goto` parameter.

### 2. Make loading continuous

Use one explicit state machine per visible surface: `opening`, `loading`, `customizing`, `ready`, `error`, and `ordinary`. Record a navigation ID and ignore late callbacks from prior pages. Display a themed background and immediate progress indicator before the first paint. For an existing page, keep its last rendered frame visible with a light loading bar until the new page commits; then reveal the new page only after its first visible paint and, for HN, after document-start style and applet readiness. Do not flash raw HN and then replace it with customized HN.

The current full-screen `HostViews` cover should be reserved for the first app launch and genuine blocking failures. Ordinary link navigation gets a nonblocking progress bar; HN applet qualification gets a short bounded cover over the new document. Split website load errors from customization failures so a 404 or offline article produces Retry, Back, and Open in browser without disabling HN styling for the rest of the session. Keep timeout recovery and provider feature checks. Avoid CSS that hides all source content indefinitely if the bridge fails. Respect reduced motion; the loader can be static and accessible through `role=status` or a native live region.

Loading sites to cover: cold launch, HN page changes, external reader, redirects, login/logout, Post, local page mount, Saved backend reads and pagination, category changes, bookmark state, dialog save/remove, and returning from background or a killed renderer. Local pages render their shell and tab bar immediately, then show a skeleton or inline status only for data that is still loading. Network and backend errors keep navigation available.

### 3. Verification gate for Part 1

Run the app on the supported Android WebView provider and navigate Home → comments → profile → back → article → back → Home; article → another article link → Back/Forward/Close; HN login/forgot; a `target=_blank` link; redirect; HTTP error; offline recovery; rotation and process recreation. Check that each tap produces visible feedback, that Back never exits while a previous in-app page exists, and that no raw unstyled frame or empty screen appears. Use slow network and reduced-motion settings to inspect the loader. Check that the HN bridge is absent on an external origin.

## Part 2: five coherent sections

### 4. One app shell and design system

Define Home, Search, Post, Saved, Me in the applet manifest or a single applet route table that both HN source and packaged pages consume. The selected tab must always match the visible section. Use a consistent icon family, labels, active state, 48 dp touch targets, safe-area padding, keyboard avoidance, text scaling, and light/dark colors. Place section navigation at the bottom, feed filters near the Home heading, and browser controls at the top only while reading a web destination. Avoid a hamburger menu: five primary destinations need direct access, while the seven HN feed views are secondary choices. The Apple design skill's `tab-bars.md` and `toolbars.md` support that separation; its `web-views.md` specifically calls for Back and Forward controls. Apply those interaction principles to Android with Android sizes and Back behavior.

Retain one shared set of tokens and components for HN source CSS, React local pages, dialogs, loading and feedback. Resolve the existing Georgia/system UI overrides. Use HN's Verdana stack for all HN applet text, including titles, controls, footer, Saved, and dialogs, with normal Android fallback glyphs. Reduce Home story titles from the current `1.0625rem` to about `1rem` and adjust weight/line-height after on-device review. Keep comment text comfortably readable. Do not copy HN's tiny desktop font sizes onto a phone.

### 5. Home

Rename Feed to Home. Replace the scrolling row of `new | past | comments | ask | show | jobs` pills with a visible current-feed selector near the heading. A single tap opens a short menu with Top, New, Past, Comments, Ask, Show, and Jobs; keep the last selected feed when returning to Home. `submit` moves to Post. HN's original links may remain in DOM for source behavior and accessibility, but show only one applet selector so people do not see duplicate navigation. Verify HN changes to its header do not leave the menu unusable.

Style the existing HN footer as the supplied reference: thin orange rule, current HN announcement when present, a compact wrapping row of Guidelines, FAQ, Lists, API, Security, Legal, Apply to YC, Contact. Preserve each real link and its in-app/external routing. Hide the source search form on Home because Search has a tab. Do not hard-code the time-sensitive YC announcement. Use the same footer presentation on HN list/detail pages when its source footer exists, with spacing above the bottom navigation.

### 6. Search

Create a clean Search page with a title, restrained illustration or text, and an explicit “Search is coming” state. Leave the input and query integration out until the separate search website is chosen. Do not send queries to HN's existing Algolia endpoint through this tab or pretend local Saved filtering is global HN search. Ensure the tab loads instantly and does not show a blank page.

### 7. Post

Make Post open HN's real `/submit` flow within an HN WebView styled with the same typography and controls. When signed out, show HN's login state with a clear return path to Post after login. Once authenticated, retain HN's form action, hidden fields, validation, and server feedback; style the existing fields and primary submit action without cloning or fabricating them. Support link submission and text/Ask submission, including the empty-URL case documented by HN. Save an unsent draft locally within the tab session where feasible, and warn before leaving a filled form if HN would discard it. Do not submit a test post. During implementation create root `TODOS.md` if it still does not exist and record “Before launch: verify a real HN post with a disposable, authorized account or explicit production approval.”

### 8. Saved

Fix the current design shortcomings found in `library.tsx` and `library.css`:

| Shortcoming | Planned change |
| --- | --- |
| Folder cards and filter chips duplicate the category choice and consume the top of the screen. | Use one compact category selector or chip row, with Manage categories in the section menu. |
| “Filter loaded stories” looks like full search but only scans records already fetched. | Rename to “Filter this page” until server search exists, explain the scope near the field, and keep it separate from the Search tab. |
| Title tap opens discussion only, even when an article URL exists. | Make title open article when available, and add a clear Discussion shortcut with the comment destination. |
| “Edit / remove” combines different actions; saved state and tags are hard to scan. | Provide separate labeled Edit and Remove actions or a small overflow menu; show a restrained bookmark state and category metadata. |
| Large status text, “Cancel scan”, “Load more”, and “Browse Hacker News” compete with the content. | Use quiet inline loading, a single pagination control, and an empty-state Home action. Keep Cancel only for genuinely long scans. |
| Empty, error, offline, and conflict states are scattered. | Give each a consistent title, explanation, and Retry action without discarding already loaded rows. |
| Styles repeat and override each other, and its footer differs from Home. | Consolidate CSS and use the shared bar, type scale, spacing, and buttons. |

Preserve existing bookmark/category storage and backend conflict handling. Check long titles, deleted categories, empty lists, many categories, slow scans, and backend outage. Do not silently redefine HN favorites as Genesis Saved.

### 9. Me and the rest of HN

Me is a local account hub. Signed out, show Sign in and password recovery. Signed in, show the HN username and links to HN profile, submissions, comments/threads, favorites, settings, and logout when those links are present for that account. Use HN cookies and the source page's own account controls; never store the HN password in Genesis storage or send it to the bookmark backend. Treat account status as unknown while loading rather than briefly displaying “signed out.” On logout, clear only the HN session via HN's own action and update the hub after a confirmed page change. Use honest links to HN account pages instead of inventing settings fields.

Keep HN's other public pages functional through the same in-app browser layer: story and comment permalinks, reply/parent/context links, vote, hide, favorite, pagination, lists, guidelines/FAQ, jobs and profile pages. Some actions require login or karma. Their controls should remain available and errors should come from HN, not a silent dead tap. Follow links from Me and Post back into the correct tab or reader context. External legal, API, YC, and article links use the external reader policy.

## Implementation order and checkable outcomes

1. Add host navigation state, native reader toolbar, URL handling, and history handling in `BrowserAdapter.java`, `HostViews.java`, `MainActivity.java`, `controller.rs`, and the contracts. Verify public link and system Back flows before changing the applet tabs.
2. Add the loading state machine and error distinction in the host and SDK bootstrap/style handoff. Verify cold and warm navigation under slow network, timeout, and renderer recovery.
3. Add retained section sessions and the shared applet route/navigation definition. Update the applet manifest, SDK navigation API if needed, source `main.ts`, and local React shell. Verify tab selection, preserved Home position, Post draft, and resource disposal.
4. Apply one design system to Home, browser chrome, Post, Saved, dialogs, and Me. Build Search placeholder and footer. Verify every section at compact and wide widths, large text, TalkBack, dark mode, and reduced motion.
5. Perform signed-in HN exploration and verification, then record any discoveries in the implementation notes before finalizing. At this step ask the user for the password for `engnirvanacompu` using a private question. Do not put it in chat logs, code, a URL, a document, or `TODOS.md`. Sign in only at `https://news.ycombinator.com`; do not create content or change account settings. Inspect the authenticated `/submit` and account pages, verify login/logout, profile/settings navigation and draft handling, and verify that the Post code reaches the real submission flow without publishing. Add the prelaunch real-post item to `TODOS.md`.

After each implementation component, run its existing checks from the correct project directory: applet/SDK TypeScript checks, package validation, Rust checks, and Android compilation or device verification as applicable. Do not add test files unless the user separately requests test coverage. Commit verified implementation components separately using the repository's required commit format. Record any device/provider limitation rather than claiming that typechecks prove browser behavior.

## Completion criteria

- Every supported HN or external link opens a visible destination or a clear recovery path. Back, Forward, Close, Reload, and system Back have predictable results.
- Returning from a discussion or article restores the prior feed and position. Switching tabs does not erase Home history, Saved state, or a Post draft in normal use.
- All five tabs appear and work; Home uses HN's Verdana family, smaller headlines, a feed selector, and the reference-style footer without its search form.
- Search is an intentional placeholder; Post uses HN's authenticated submit flow; Saved shortcomings above are resolved; Me exposes the available account routes without exposing credentials.
- Cold launch, HN navigations, external navigation, local page loads, backend reads, login transitions, and errors have immediate nonblank feedback with no visible raw-to-customized flash.
- Public routes and authenticated routes are each verified on device. A real post remains an explicit prelaunch TODO and is never used for this verification.
