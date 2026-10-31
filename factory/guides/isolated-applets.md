# Build applets with an owned foreground

The API-3 architecture uses SDK/tools `0.4.0`, manifest schema `2`, data schema `1` and bundle format `1`. A source adapter runs inside a hidden website document. An owned foreground runs in a separate packaged document. The Android host owns an opaque barrier between them, native navigation, recovery and explicit website views. A new applet must declare both documents and a URL contract.

## Define the route inventory first

List every known route family and its expected content, query parameters, authentication conditions, actions and return behavior. Share a contract among source sections for the same website. The mandatory `unmatched: "unsupported"` outcome covers future routes. A route match permits extraction; it never proves that the DOM contains valid content. Login, challenge, network-error and unfamiliar markup can occur at a custom URL.

```json
{
  "schemaVersion": 2,
  "id": "my-reader",
  "name": "My reader",
  "dataSchemaVersion": 1,
  "sources": [{"id":"main","startUrl":"https://example.com/","entry":"src/main.ts","routeContractId":"site"}],
  "pages": [{"id":"app","entry":"src/app.ts"}],
  "foreground": {"pageId":"app","screens":["feed","detail"]},
  "routeContracts": [{
    "id":"site", "origins":["https://example.com"], "unmatched":"unsupported",
    "routes":[
      {"id":"login","path":"/login","result":{"kind":"website","reason":"Sign in on the website"}},
      {"id":"feed","path":"/","result":{"kind":"custom","screen":"feed","adapter":"feed"}},
      {"id":"detail","path":"/item","query":{"id":"present"},"result":{"kind":"custom","screen":"detail","adapter":"detail"}}
    ]
  }],
  "actions": [], "capabilities":["dom"]
}
```

Rules match in order. Put reserved routes before dynamic parameters such as `/:handle`. The path grammar supports literal segments, `:parameter`, and a final `*`, with at most 16 segments and 256 characters. `/settings/*` also matches `/settings`. Query constraints require a single value and support `"present"` or `{"equals":"value"}`. Fragments can use `{"equals":"fragment"}`. Extra query parameters remain in the actual URL. Query/fragment changes change navigation identity even if the rule is unchanged.

Origins are exact HTTPS origins. Aliases, subdomains and redirectors need their own explicit declarations if they require extraction. Never suffix-match a hostname. Malformed escapes, credentials, unsafe path encodings and dot segments are rejected before URL normalization. The validator checks duplicate/unreachable rules, valid references, source start URLs and shell choices. Keep contract metadata under 128 KiB, with at most 16 contracts and 100 rules each.

## Extract data in the source adapter

Default-export `defineSourceAdapter({adapters:[...], activate(context){...}})`. Register exactly the adapter names referenced by that source contract. Inspect authorized current DOM before choosing selectors. Keep record IDs, extraction and source commands inside the applet. The platform contains no website selectors or application data schemas.

Use managed watchers and stable content keys. Validate route parameters, account identity, content family and error/challenge signals before publishing. Publish loading, ready, empty, auth-required, challenge, unsupported or error. Empty needs an affirmative empty marker or a validated complete structure; zero selectors during loading is not empty.

```ts
import {defineSourceAdapter} from '@genesis/sdk';
export default defineSourceAdapter({adapters:['feed','detail'],activate(context){
  const publish=()=> {
    // Replace with inspected website extraction and validation.
    void context.source.publish({state:'unsupported'});
  };
  publish();
  context.onDispose(()=>{/* release applet resources */});
}});
```

Source adapters cannot use storage, backend services, modals or foreground navigation capabilities. They publish bounded JSON. They never mount visible UI, copy whole DOM trees, export cookies/tokens or pass executable HTML to the foreground. The source may be disposed/recreated at any navigation. Source media remains muted and source popups/fullscreen/files/permissions are unavailable while hidden.

`source.publish` coalesces to at most four publications per second. Its promise queues publication rather than acknowledging a website action. The host caps snapshots at 192 KiB within a 256 KiB envelope. Window/paginate large feeds and deduplicate records by identity. The foreground receives only its applet's accepted source snapshot; retired source documents lose delivery authority.

## Render owned UI

Default-export `defineForeground({screens:[...],mount(context,root){...}})`. Register exactly the declared foreground screen names. React is optional; `mountReact` works inside this owned root. The local interface must mount immediately and show a skeleton before source data arrives. Do not await source loading in `mount`.

```ts
import {defineForeground} from '@genesis/sdk';
export default defineForeground({screens:['feed','detail'],mount(context,root){
  const status=document.createElement('p');status.setAttribute('role','status');
  status.textContent='Loading…';root.append(status);
  return context.source.subscribe(snapshot=>{
    status.textContent=snapshot.state==='loading'?'Loading…':snapshot.state;
    // Validate snapshot.data and render semantic applet-owned elements.
  });
}});
```

`source.subscribe` receives the latest host envelope with `state`, `data`, `url`, `sourceId`, `pageId`, `sectionId`, `epoch` and route outcome. Use `pageId` to select an internal owned page such as Saved. `context.pages.open(pageId)` changes that destination; your foreground owns its renderer and cleanup. Existing `definePage` modules can be mounted as internal screen components with cleanup. The foreground's `context.sourceId` is null. The current website source comes from the accepted snapshot.

Render strings as text. Rich text needs an applet-owned allowlisted model of text, links and formatting, not upstream HTML. Validate destinations and media URLs. Preserve last valid content on a same-route refresh failure with a stale notice. Clear private content when account identity changes. Keep errors distinct from empty results. Confirm writes through the existing service receipts; a timeout can leave an unknown remote result.

Foreground storage/services use the same stable applet namespace and declared service IDs as earlier versions. No backend/data migration is implied by changing rendering. Keep account and backend authorization separate. Cookies stay in browser sessions and never become backend credentials.

## Navigation and website views

`context.sources.open(sourceId,url?)` navigates a declared source and keeps its owning applet. `context.pages.open(pageId)` opens an owned destination. Native sections are manifest-configured; do not duplicate their primary tab bar. Preserve return navigation, stable scroll anchors and relevant page state. Native Back closes an owned modal before leaving a page. Use managed `navigation.onBack` and `navigation.setLeaveGuard` for applet-owned transient UI/drafts.

Use `context.webViews.open({url})` for external articles, unsupported routes and source-owned forms/media. An explicit website button should state the action, such as Sign in, Reply on website or Open website. Native controls display the actual origin and provide Back/Forward/Reload/Close. Opening the current source URL adopts the exact live source session, preserving form tokens, POST state and cookies. The host revokes its adapter before exposing it. Native departure checks visible edited fields with a boolean-only Stay/Leave guard. Closing a source-origin website visit revalidates the source and foreground. Arbitrary form/POST state is not restored after process death. Opening another URL creates an independent bridge-free reader.

Never reveal the source as a loading/error fallback. Unknown routes show an owned unsupported state with Retry, Back and Open website. Login, challenges, composer, uploads, settings, voting and other upstream state changes use website presentation unless a separately qualified action implementation exists. Do not reconstruct a POST as a GET or automatically repeat uncertain actions. A source route classified `website` produces an owned landing; foreground user intent opens the provider. Deep links and redirects do not grant adapter privileges.

`source.command({name,payload?,epoch})` delivers an applet-defined request to the current adapter's `source.onCommand` callback. Always pass the accepted snapshot.epoch; stale or missing epochs are rejected. It acknowledges dispatch, not the eventual website result. Limit it to read/navigation operations such as loading a feed window. Revalidate source DOM identity and epoch before acting. Upstream mutations require deliberate website interaction. Commands do not support durable background execution.

## Maintenance and acceptance

A screen change must update its route inventory, model validation, owned renderer and documented provider actions together. Preserve applet/source/page/service IDs and data authority. SDK/tools/schema compatibility is checked on build/install. Schema-1 packages remain maintainable, but a mixed API-3 host gives them ordinary website presentation; migrate both rendering roles to gain customization. An API-3 package never falls back to the legacy mixed document.

Run the actual launcher-to-feed/detail/Back, section, Saved, account/provider and external-reader journeys. Test slow/offline source loading, changed markup, redirect/query/hash changes, repeated navigation, stale replies, empty feeds, failed services and account changes. Verify hidden source content never appears in frames, accessibility trees, keyboard focus or sound. Check large text, TalkBack, light/dark, reduced motion and provider Close focus. Check Android touch targets and list responsiveness. Qualify real website flows separately from synthetic component checks. See [verification](verification.md).
