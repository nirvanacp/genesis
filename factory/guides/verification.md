# Verification

Check the change you made, on the journeys it affects, and report exactly what the evidence shows. Do not create or modify test files unless the user asks for test coverage.

## Kinds of evidence

| Evidence | Proves | Does not prove |
| --- | --- | --- |
| `npm run check` | The manifest is valid schema 5 and the code type-checks | That any page extracts or any screen renders |
| `npm run build` | The bundle builds | That the device accepts or runs it |
| `dev install` receipt | The device accepted this revision | That screens work |
| Device walkthrough with the real website | The journeys you walked, with the account you used | Journeys you did not walk, other accounts |
| Screenshot | What one frame looked like | Interactions, other states, accessibility |
| Synthetic data or component preview | The component's rendering of that data | Extraction, accounts, services, navigation |

Label each piece of evidence by its kind. Never present a synthetic or partial check as acceptance.

## Static checks

Run after every change:

```sh
npm run check
npm run build
```

For the backend, run its own syntax or type check. Review the diff for selectors that depend on visual class names, unbounded lists, missing statuses and secrets.

## Device walkthrough

1. Install with `dev install` and confirm the receipt names the new revision.
2. Open the applet from the Genesis launcher.
3. For each affected journey: open the screen, watch its pending state, wait for content, perform the action, see the outcome, press Back, and confirm the opener returns with its scroll position.
4. Exercise loading, empty, sign-in and failure on purpose where you can: a slow network, a signed-out session, airplane mode, a page with no results.
5. Open and close the website sheet from each control that opens it, and press Back inside it.
6. Leave the app and return; reload it from the Genesis menu.
7. Check light and dark, large text and a narrow width on the changed screens.
8. For stored data: write it, leave, reopen, and confirm it reads back. For services: confirm the record on the server through the app, not by editing the database.

Do not post, comment, message, follow, vote, purchase or change account settings during checks unless the user asked for that action. Opening a form proves the form opens. Use disposable records only where the user allows, and remove only those.

## Diagnosing

Start from the evidence: what the screen shows, the `SourceView` status and error code, the install receipt, the service response. Find the component that owns the failure (adapter, screen, store, service or platform) before changing code. `NOT_READY` means the extractor never recognized the page; `unsupported` means the URL matched no route or redirected; `SNAPSHOT_TOO_LARGE` means the model needs bounding. Fix the owner, then rerun the journey that failed and the journeys next to it.

When the platform is at fault, write down the capability or contract that is missing and a sanitized reproduction; do not work around host internals.

## Reporting

For each requirement in the current spec, report one of: implemented, verified (with the evidence kind), failed, blocked (with the reason and what would unblock it) or deferred by the user. Record the result in the change record and the current spec. A missing account, device or service blocks the affected acceptance; it does not shrink the app. Do not call the app complete while a core journey is unmet.
