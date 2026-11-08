# Verification

Check the change you made, on the journeys it affects, and report exactly what the evidence shows. Do not create or modify test files unless the user asks for test coverage.

## Kinds of evidence

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| `npm run check` | The applet matches the installed SDK and tools, the manifest is valid schema 6, the code type-checks, and the adapter loads and declares every route's page | That any page becomes ready, any region reads correctly or any screen renders |
| `npm run build` | The bundle builds | That the device accepts or runs it |
| `dev install` receipt | The device accepted this revision as current | That screens work |
| Device walkthrough with the real website | The journeys you walked, with the account you used | Journeys you did not walk, other accounts |
| Screenshot | What one frame looked like | Interactions, other states, accessibility |
| Synthetic data or component preview | The component's rendering of that data | Reads, accounts, services, navigation |

Label each piece of evidence by its kind. Never present a synthetic or partial check as acceptance.

There is no fixture runner for adapters: the live website on a device is the only evidence that pages and regions read correctly.

## Static checks

Run after every change:

```sh
npm run check
npm run build
```

`check` first compares the applet with the tools: `applet.json`'s schema version, the `@genesis/sdk` dependency and the installed SDK. A difference fails with `APPLET_INCOMPATIBLE` and lists each `field applet → current`; update the applet to the current SDK and run `check` again. It then validates the manifest, type-checks `src` and imports the adapter in Node. Importing runs your code, so check only applets you trust. Read its warnings: an unreachable route never matches, and an async `read` fails on the device.

For the backend, run its own syntax or type check. Review the diff for selectors that depend on visual class names, unbounded lists, reads outside an item's extent, non-unique keys, missing states and secrets.

## Device walkthrough

1. Install with `dev install` and confirm the receipt names the new revision with status `current`. `dev status <applet-id> --device <serial>` shows the installed revision, its status and, for an incompatible applet, the direction and mismatches.
2. Open the applet from the Genesis launcher.
3. For each affected journey: open the screen, watch its loading state, wait for content, perform the action, see the outcome, press Back, and confirm the previous entry returns at once with its scroll position.
4. Exercise loading, empty, sign-in and failure on purpose where you can: a slow network, a signed-out session, airplane mode, a page with no results.
5. Walk the presentation scenarios below on the changed routes.
6. Leave the app and return; reload it from the Genesis menu.
7. Check light and dark, large text and a narrow width on the changed screens.
8. For stored data: write it, leave, reopen, and confirm it reads back. For services: confirm the record on the server through the app, not by editing the database.

Do not post, comment, message, follow, vote, purchase or change account settings during checks unless the user asked for that action. Opening a form proves the form opens. Use disposable records only where the user allows, and remove only those.

## Presentation scenarios

| Scenario | Expected |
| --- | --- |
| Open a routed page | The skeleton, then the screen; no website flash |
| Back to a previous entry | The last copy at once, marked stale, then the fresh page |
| A page that needs an account, signed out | The site's sign-in under the website bar; after signing in, the applet screen |
| Done or Back from that sign-in | The page before the one that needed the account, or the primary tab |
| A link to a page without a route, then Done | The website, then the previous entry |
| A link to another origin | The website in the same context; Back returns |
| View website from the menu, then Done | The same page as the website, then the screen again |
| A page that never becomes ready | The skeleton, then the website after 15 seconds |
| Reload fails over a stale copy | The copy with an inline error, then the website after the deadline |
| Reselect the current tab, off and on its start page | The start page; then scroll to top |
| An action whose evidence does not appear | The `unknown` message, not a success |

## Diagnosing

Start from the evidence: what the screen shows, `usePage()`'s status and error code, the region's status, the action result, the install receipt, the service response. Find the component that owns the failure (adapter, screen, store, service, website or platform) before changing code.

| Symptom | Usually |
| --- | --- |
| The website appears after 15 seconds | `ready` never returned `true` for this page |
| The website appears at once on a routed URL | The page is `auth`, or an error with no stale copy |
| `NOT_FOUND` page error | The route's `page` is missing from the adapter |
| `PAGE_TOO_LARGE` | The regions read too much; bound the selectors |
| A row never updates | `read` uses nodes outside the item; add them to `extent` or `dependsOn` |
| A typed value is not read | The region needs `fields: true`, or the site sets the value from script |
| `ephemeral` region, `PRECONDITION_FAILED` actions | Repeated keys |
| `TARGET_NOT_FOUND` | The record left the page before the action ran |
| `unknown` with `DEADLINE` | `until` never held; check the evidence against the page |
| `PROTOCOL_MISMATCH`, `APPLET_INCOMPATIBLE`, "Needs update" | The applet was built for another SDK; rebuild with the current one |

Building with `genesis-applet build --debug` keeps the adapter runtime's measurements in `window.__genesisStats` on the page. Fix the owner, then rerun the journey that failed and the journeys next to it.

When the platform is at fault, write down the capability or contract that is missing and a sanitized reproduction; do not work around host internals.

## Reporting

For each requirement in the current spec, report one of: implemented, verified (with the evidence kind), failed, blocked (with the reason and what would unblock it) or deferred by the user. Record the result in the change record and the current spec. A missing account, device or service blocks the affected acceptance; it does not shrink the app. Do not call the app complete while a core journey is unmet.
