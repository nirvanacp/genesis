# Explicit navigation and website presentation

Use SDK/tools 0.5.0, manifest schema 3 and runtime API 4 for new applets and navigation migrations. Existing schema-2/API-3 applets remain executable with their original behavior. An API-3 host cannot execute API-4 packages. Inspect the actual host's supported runtime list before installing.

## Declare coverage before rendering controls

The manifest owns URL coverage. The host decides presentation; an applet validates website content and renders its declared screens. Never use an independent path regex, `unknown => webViews.open`, a custom wildcard catch-all, missing selectors or a missing owned anchor to choose website mode.

| Decision | Meaning and normal activation |
| --- | --- |
| custom | Declared internal route, adapter and owned screen; navigate within the applet |
| page | Declared local applet page; no source website UI |
| website | Declared original-site workflow or applicable declared website action; marked website control |
| external | HTTP(S) origin outside all applet contracts; follows the explicit external policy and displays a website cue |
| uncovered | Internal URL has no declared route; native owned explanation, Back and policy-permitted explicit Continue |
| blocked | Invalid or denied destination; explanation without a website escape |

A URL match permits extraction, not content validity. Keep loading, validated content, affirmative empty, authentication, subscription/challenge gates and errors distinct. An unfinished page must remain owned. Never reveal source pixels or submit an account action to make navigation appear successful.

Every contract declares exact HTTPS origins, ordered bounded rules, `defaultSourceId` and `unmatched: "unsupported"`. Each internal origin belongs to one contract; sources may share it. Ordinary links prefer the active matching source, otherwise that contract's default. Cross-source links remain in the same applet and preserve the current native primary section. Explicit source choices must agree with the destination contract.

Retain the existing path grammar: literal segments, `:parameter` and final `*`; first match wins. Reserve settings/login/account paths before dynamic user handles. Query/fragment constraints and duplicate constrained query handling are part of full destination identity. Do not strip query/hash, normalize unsafe paths into supported routes, suffix-match origins or silently promote HTTP to HTTPS.

Schema 3 adds required top-level `navigation` and `websiteActions`. A custom route result requires a short static `title` for pending/error headings. Example fields, to merge into a complete manifest:

```json
{
  "navigation": {
    "external": {"default":"website", "origins":[]},
    "uncoveredWebsiteRecovery": true
  },
  "websiteActions": [
    {"id":"reply-original","contractId":"site","routeIds":["discussion"],"label":"Reply on website","reason":"Use the original reply controls"}
  ]
}
```

A website action references existing custom route IDs. It distinguishes reading a post from using original controls at the same URL. It grants presentation only; opening Reply never means a reply was submitted. Known website routes need no redundant action. Blocked routes always win. External origin overrides use exact origins and website/blocked outcomes. External policy controls main-frame presentation, not subresources or all outbound network activity.

## Resolve, show the destination cue, activate

Use `NavigationLink` / `NavigationTab` from `@genesis/sdk/react`, or `createNavigationControl` from `@genesis/sdk`. Supply an absolute URL built against the actual source URL, never against the packaged foreground URL.

```tsx
import {NavigationLink} from '@genesis/sdk/react';
// context is the foreground AppletContext.
<NavigationLink context={context} target={{kind:'url',url:'https://example.com/item?id=123'}}>
  Read discussion
</NavigationLink>
<NavigationLink context={context} target={{kind:'url',url:'https://example.com/item?id=123',websiteActionId:'reply-original'}}>
  Reply on website
</NavigationLink>
```

The example requires corresponding manifest origins/routes/action. Helpers batch/cache resolution, wait for decisions, append visible Website cues, and select the right activation intent. A host decision never validates the source data. Native primary sections remain the only primary navigation; do not add duplicate website footers to custom screens.

Equivalent applet-specific controls may use these methods:

```ts
const [decision] = await context.navigation.resolve([
  {kind:'url',url:'https://example.com/item?id=123'}
]);
// Render the label and website/external cue from this decision before activation.
await context.navigation.activate({
  decision,
  intent: decision.kind==='website'||decision.kind==='external' ? 'open-website' : 'navigate'
});
```

`resolve` accepts up to 64 targets/64 KiB, performs no navigation and returns positional decisions. `navigation.subscribe` reports current decision, version and applet/recovery/website mode. Decisions include revision/generation/navigationVersion and a host-computed key. Activation recomputes policy. A stale decision returns `STALE_NAVIGATION`; refresh the control and require a fresh click if its destination mode changed. Do not automatically retry a website entry.

For a declared current-page action, resolve its URL with `websiteActionId` only when the ordinary destination is custom. Applying an action to another route is invalid. Resolve external/declared website URLs normally. URL tabs from source observations must be resolved even if they were absent from the original inventory. Keep unknown tabs discoverable and let native unsupported recovery explain them. Do not silently hide required workflows.

Source adapters receive read-only `context.binding.route` and may use its accepted custom screen/adapter for extraction. They cannot call foreground resolve/activate. Keep handle/post identity, observed tab context, bounded model validation and readiness evidence in the applet. Source-only tabs without URLs use existing epoch-bound read commands. A command's URL change still undergoes host policy and never grants website intent.

`context.sources.open` and `context.pages.open` remain compatibility helpers through ordinary policy. On API 4, direct `context.webViews.open` rejects with `USE_DECLARED_NAVIGATION`; it is only a legacy API-3 interface. Plain anchors, modified clicks, popups and redirects also meet host policy. Unmarked noncustom links show native recovery. Programmatic changes cannot silently open the provider.

## Original website and return

An entered website remains a website as its user browses, even on URLs with custom coverage. Do not reclaim navigation automatically. Native chrome shows Website and actual origin, website Back/Forward, and Return to the applet. Back traverses website history; Return restores the opener. Recovery → Continue → Return returns to the recovery explanation, where Back restores the custom opener.

Exact-current source adoption preserves the live session/forms and revokes adapter authority. Other URLs open independent bridge-free readers. Dirty fields receive Stay/Leave. Source-origin returns revalidate account/source data before private content is reused. No POST replay or durable restoration of arbitrary website JavaScript is supplied. Protected forms, playback and uploads stay website-owned unless separately implemented and qualified.

## Authoring and verification workflow

Maintain a README table with control/journey, example URL, contract/rule, source, adapter/screen or action, readiness/empty/gated/error evidence, visible cue, Back/Return and actual verification status. Reference manifest IDs rather than duplicating executable path lists. Declared support is different from qualified support.

```sh
npx --no-install genesis-applet routes list . --json
npx --no-install genesis-applet routes inspect . --url https://example.com/item?id=123 --json
npx --no-install genesis-applet routes inspect . --url https://example.com/item?id=123 --action reply-original --json
npx --no-install genesis-applet check . --json
npx --no-install genesis-applet build . --out dist --json
```

Route inspection loads no website and does not qualify source selectors. Test the actual launcher → content → detail → Back journey, unknown internal link, external link/Return, source redirect/query/hash, source-command tab change, protected-form entry/cancel, stale decision and repeated section/provider return. Record installed revisions, device/provider and loading/settled evidence. Check narrow/large-text/dark/TalkBack behavior; cues and Return must stay readable. Do not submit social/account/purchase actions for verification. Keep blocked requirements explicit; never substitute a website-only app for requested custom coverage.
