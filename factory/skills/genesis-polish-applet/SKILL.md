---
name: genesis-polish-applet
description: Audit an existing Genesis applet against the native feel bar on a device, fix what falls short in order of impact, and record the acceptance bar.
---

# Polish a Genesis applet

Read [factory instructions](../../AGENTS.md), [rules](../../guides/rules.md), [records](../../guides/applet-records.md), [native feel](../../guides/native-feel.md) and the [UI kit](../../guides/ui-kit.md), then the applet's `.specs/current.md`, `src/routes.ts`, its page module and its screens. Polish keeps the applet's features, data, routes and the user's explicit choices; it changes how they look and respond, and adds routes only for pages a journey already reaches.

## 1. Static audit

Check the code before the device, so the device time goes to what only the device shows. From the applet directory:

| Check | Look for |
| --- | --- |
| Foundation | `src/theme.css` with tokens and base styles, `Stage` around the screen slot, a toast region, `ProgressBar`. Missing parts come from the kit |
| Reduced motion | `grep -rn "prefers-reduced-motion" -A3 src` covers `*::before` and `*::after` and sets durations to zero |
| Details open at once | `grep -rn "navigates: true" src` — each site link click that opens a routed page should be `navigate({ url })` when the reader has the URL |
| Busy feedback | `grep -rn "useCommand\|useInput\|reload(" src` — each tapped call runs through `useBusy` or shows its ongoing state and an outcome |
| Website cue | `grep -rn "viewWebsite" src` — each control carries the cue or says "View on website" |
| Fallback text | `grep -rn "no subject\|?? 0\|No results" src` — each is rendered only when the page is ready and not stale |
| Skeletons | One per destination; only one class paints and animates the shimmer |

## 2. Coverage audit on the device

Use only a device this task may drive, under the device rules of the instructions you follow, and sign in with [test accounts](../genesis-test-accounts/SKILL.md) when needed. Do not post, message, vote, follow or change account settings.

1. Cold start the applet signed in, then signed out (sign out on the website or use a device with no session).
2. Follow every core journey and every tab. For each page, note whether it shows an applet screen or the website, and its URL.
3. List every website appearance the current spec does not mark as on purpose. Each is a coverage defect: a landing URL with no route, a `ready` reader that never turns true, or an account reader that returns `null`.

## 3. Feel probes

Record the screen during each probe and step through the recording frame by frame; one-frame flashes are invisible otherwise. Run the [native feel scenarios](../../guides/verification.md#native-feel-scenarios), and also:

- open each tab and each detail from a list, twice: once cold and once from the stale copy;
- Back quickly through a deep stack, and with the system gesture;
- turn the network off, then tap Retry, Refresh, a toggle and a command;
- a refused or failing service call, when the applet has a backend;
- reduced motion, dark theme, 200% text and the narrowest width on each changed screen.

## 4. Fix in order of impact

1. The website where a screen belongs, and states that never end (endless skeleton, stuck spinner).
2. Taps that show nothing: missing pressed states, busy states and outcomes.
3. Wrong states: fallbacks shown as content, empty shown while loading, another destination's skeleton.
4. Motion: missing direction, leftover copies, animations that run under reduced motion.
5. Visual detail: layout shift, truncation, contrast, spacing against the product's app.

Fix the owner, as [verification](../../guides/verification.md#diagnosing) describes: a missing route goes in `src/routes.ts`, a wrong reader in the page module, a state in the screen. Prefer the kit's code to new code. When the platform is at fault, record the capability and a sanitized reproduction instead of working around it.

## 5. Re-verify and record

Rerun each probe that failed and the journeys next to it. Run `npm run check` and `npm run build`. Mark every [acceptance bar](../../guides/native-feel.md#acceptance-bar) item in the current spec's Native feel section with its evidence, write a change record, and commit. Report what remains failed or unchecked.
