# X applet switches to the mobile website

Investigation date: 1 November 2026, Asia/Kolkata. Scope: `factory/applets/x.com`, with read-only tracing of the shared Android/Rust website provider. Branch: `proto/phase-5`; inspected repository revision: `77764df`. This is a report-only investigation. No application code, tests, installed packages, backend records or account settings were changed.

## Finding

The switch is reproducible. Tapping **Subs** on the public Crémieux profile opens X's original mobile website because the applet has no custom route for `/:handle/subs`. The applet still presents Subs as a normal tab beside custom Posts, Replies, Reposts and Media. Its click handler silently treats the unrecognized URL as a website destination.

Genesis intentionally has two presentation modes: its separate custom applet interface and a host-managed original website view. The latter preserves original-site forms, account actions and media. The problem here is incomplete route coverage combined with an unclear transition between those modes. The observed switch follows an explicit website-opening code path; the evidence does not indicate a random CSS change or a loading failure exposing the hidden source.

After entry, the website owns subsequent navigation. Even clicking Posts, which has a custom applet renderer, remains inside the website. **Close reader**, the X icon in the native top bar, restores the custom opener. Back first traverses website history and only closes the view when that history is exhausted.

## Recording analysis

Input: the user's local `WhatsApp Video 2026-11-01 at 9.51.54 AM.mp4`, duration 45 seconds, 576 × 1024. It records the emulator through a camera. Screen text was treated as evidence, not instructions.

The whole recording was sampled every three seconds, with the first 9.4 seconds inspected at five frames per second using overlapping contact sheets. Times below are approximate; sampled frames do not establish absence of every one-frame artifact.

| Recording time | Visible behavior | Interpretation |
| --- | --- | --- |
| 0–1.6 s | Customized Crémieux profile, native Genesis bottom sections, Reposts selected | Custom applet mode |
| About 1.6–5 s | Profile skeleton briefly headed Home, then profile with Replies selected | Internal custom navigation/loading; the Home heading is a separate labeling issue |
| About 6–7.2 s | Pointer moves over Subs; immediately afterward the top bar gains Back/Forward, `x.com` and Close, and Genesis sections disappear | Website-provider entry; the recording suggests Subs, and device reproduction confirms that exact trigger |
| About 15–45 s | Original X profile controls, Subscribe/promotion, tabs, X bottom navigation and feed scrolling | Continued browsing in the same original-site session |

## Live reproduction

Used the existing authenticated `emulator-5554`, Android 17, Google Android WebView `156.0.8078.47`. App ID: `app.nirvana.genesis`; applet ID: `x-bookmarks`; SDK 0.4.1, tools 0.4.2, runtime API 3, manifest schema 2. The loaded foreground asset URL identified X revision `069696cfbaa9b3f2360e489300cb67660bae7a827053cf1f6a0f6cb49d1845a0`, matching the current skeleton-delivery record. Host source was inspected at the repository revision above; no independent APK binary hash was collected.

The emulator was already on the same custom public profile's Replies tab. No login or account change was needed. Source and foreground WebViews were inspected through the host's explicit Developer tools → Inspect current document control. Evidence collected was limited to public tab labels/URLs, selected state, document identities and native navigation labels. Private feed/account contents and credentials are excluded from this report.

1. On the custom Replies screen at `https://x.com/cremieuxrecueil/with_replies`, inspect the observed tabs. Subs points to `/cremieuxrecueil/subs`.
2. Tap Subs in the custom foreground. A new independent website WebView opens at that exact URL. The original hidden Replies source and packaged foreground still exist separately.
3. Wait for the website. Its Subs tab is selected. The native bar shows `x.com`, Back, Forward and Close reader.
4. Tap Posts inside the website. The same website document navigates to `/cremieuxrecueil`; it does not become a custom screen.
5. Press Android Back. That document returns to `/cremieuxrecueil/subs`, still in website mode.
6. Tap Close reader. The packaged custom foreground returns to the original Replies screen with Replies selected. Website navigation did not replace the opener with Posts or Subs.

## Root cause and ownership

The complete path is:

`observed X tab → XModel.tabs → ordinary owned tab button → open(tab.url) → routeKind(path) returns null → webViews.open → independent original website`

- [Source tab extraction](../../../factory/applets/x.com/src/main.tsx) around lines 46–49 copies observed labels and destinations into `XModel.tabs`. It does not attach a custom/website/unsupported presentation decision.
- [Owned navigation](../../../factory/applets/x.com/src/app.tsx) lines 77–91 renders every observed tab alike. `open()` opens a website when `website` is true, the origin is external, or local `routeKind()` returns no match. Consequently Subs never reaches the owned unsupported screen described by the manifest's unmatched policy.
- [Local route classifier](../../../factory/applets/x.com/src/view-model.ts) lines 29–41 recognizes the profile root, Replies, Reposts and Media, but not Subs.
- [Manifest route contract](../../../factory/applets/x.com/applet.json) likewise omits Subs and declares unmatched URLs unsupported. Thus Subs is genuinely missing custom coverage, rather than a manifest-supported screen accidentally rejected by the helper.
- [Native provider](../../../android/app/src/main/java/app/nirvana/genesis/IsolatedBrowser.java) lines 209–229 creates an independent WebView when opening a different URL, permits safe HTTP(S) navigation within it, and restores the opener on Close. Lines 258–263 make Back traverse website history first.
- [Rust provider dispatch](../../../android/native/src/isolated.rs) around lines 734–739 adopts the exact current source only when the requested URL equals the current URL. Otherwise it requests an independent reader. A general link fallback also exists around lines 400–407, so repairing one button does not establish consistency across all link paths.

Primary ownership is X applet route coverage and navigation presentation. Provider history behavior matches the current shared architecture. Native website chrome could communicate the mode and return action more clearly, but this reproduction does not establish a broken host state transition.

## Similar cases checked

| Case | Evidence | Result and implication |
| --- | --- | --- |
| Subs from custom Replies | Actual device, native tap, public source URL inspection | Reproduced silent website handoff |
| Posts after entering Subs website | Actual device | Remains website despite a custom renderer existing |
| Android Back after website Posts | Actual device | Returns to website Subs, explaining why Back may appear unable to restore customization |
| Close after website browsing | Actual device and owned selected-tab inspection | Returns to custom Replies, not the last website destination |
| Media from custom profile | Actual foreground click and settled state | Stays custom; observed selected label became Videos after source completion |
| Profile photo | Actual foreground click and separate WebView identity | Opens `/:handle/photo` in website mode. Label is View profile photo, which does not warn of that change |
| Close after profile photo | Actual device | Restores custom Media |
| Follow on X | Actual foreground click, same source WebView identity exposed | Deliberately adopts the current source page. It only opens original X; no Follow was submitted. Close was exercised |
| Profile banner | Code and manifest only | Explicit website destination `/:handle/header_photo`; same unclear label as profile photo. Not separately clicked |
| Post Show more | Code only, `components/post.tsx:82` | Forces website mode even though clicking the post body opens custom discussion. Ordinary text expansion can therefore change the whole presentation. No matching live excerpt was exercised |
| Reply/repost/like/share, bookmark menu, video, messages, settings | Code only | Deliberate website handoffs. Several accessible labels say on X; icon-only appearance can still obscure the transition. These do not execute the named social action themselves |
| Future or less common profile tabs | Actual resolver/helper calls, no live page qualification | `/:handle/highlights` and `/:handle/likes` also have no helper match and are manifest-unsupported. If offered as URL tabs, they take the same silent website path. Their availability and access are account-dependent |

### Duplicate route definitions can disagree

An ad hoc check bundled the actual `view-model.ts` to `/tmp` and compared `routeKind()` against the actual tooling `resolveRoute()` and manifest. No test files were added.

| Path | Local helper | Manifest | Consequence for ordinary, non-forced links |
| --- | --- | --- | --- |
| `/:handle/subs` | No match | Unsupported | Direct website entry bypasses owned unsupported recovery |
| `/settings`, `/login` | Profile | Website | Different classification can send these through source navigation to an owned website landing rather than directly opening a provider. Explicitly forced controls bypass this discrepancy |
| `/notifications/new`, `/i/history/new` | Notifications / Saved | Unsupported | Helper overmatches hypothetical child paths; host rejects custom coverage. These are diagnostic paths, not observed current X links |
| `/:handle/photo`, `/:handle/header_photo` | No match | Website | Intentional website coverage, with weak presentation cues |

The host contract still controls extraction permission. These discrepancies establish inconsistent navigation policy, not unauthorized access. Adding only one Subs regex would also be insufficient: manifest coverage, source readiness/model validation and owned rendering must agree.

## Recommended follow-up

1. Centralize the X link presentation decision around the declared route inventory. Distinguish custom content, explicit website destinations and unsupported routes before rendering controls. Preserve the host's route validation.
2. Support Subs reading as an owned profile route if the intended app includes it, with actual content identity, loading, empty, subscriber-gated and failure handling. Keep subscription/purchase actions in the website. Until that exists, visibly identify the website destination or show owned unsupported recovery with an explicit Open website action. Do not silently remove the tab.
3. Make all website handoffs understandable before activation, especially profile photos/banner and Show more. Use a clear website cue and a return label such as Back to applet. This does not require a confirmation dialog for every click.
4. Preserve provider sessions for protected forms and media. Avoid automatically taking control whenever a website reaches a custom-supported URL; that could interrupt forms/history. Any explicit return-to-current-page feature would need separate design and session qualification.
5. Use the destination type for pending titles. A profile opened under Home currently shows a Home heading while its profile skeleton loads, increasing the sense that navigation has gone elsewhere.

Acceptance for a later fix should cover Subs from Posts/Replies/Reposts, gated content without a purchase, direct/query links, custom Media, avatar/banner, Show more, website Posts/Back/Close, and repeated provider return. No fix is implemented by this report.

## Verification and limits

- Passed: live reproduction, website Posts navigation, history Back, Close restoring the custom opener, supported custom Media, profile-photo handoff/return and explicit Follow handoff/Close without submitting a follow.
- Passed: local standalone manifest/TypeScript checker, `node packages/applet-tools/src/cli.mjs check factory/applets/x.com --json`, run from the workspace root. A `npx --no-install` attempt stalled; the direct installed-source CLI completed successfully.
- Passed: actual helper/manifest comparison for the listed diagnostic paths. This is static policy evidence, not live qualification of every path.
- Not run: physical-device coverage, every X profile/account variation, Premium/subscriber actions, full video playback, external redirects, offline/failure stress, TalkBack, process death and exhaustive frame-level isolation checks. The task did not authorize publishing or changing account data.
- Cleanup: website views closed, no diagnostic package installed, no backend started, task adb forwarding removed and task UI dumps removed from the device. Return to Genesis was invoked to end the visit-scoped inspector. Temporary contact sheets and diagnostic scripts remain under `/tmp/genesis-ui-investigation`; no private screenshots or raw UI dumps were committed.

The report confirms a coverage-and-navigation UX defect with a reproducible trigger. It does not claim that all changes between custom and original website UI are defects: forms and account/media actions intentionally use the original website.
