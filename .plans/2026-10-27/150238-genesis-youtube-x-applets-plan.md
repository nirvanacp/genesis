# Genesis YouTube and X applets plan

Created 27 October 2026, Asia/Kolkata. Scope: `applets/youtube.com/` and `applets/x.com/`. Website-specific code stays in these directories. Read the [runtime contract](150238-genesis-runtime-sdk-plan.md) before implementing either applet.

## 1. Website inspection is an implementation task

No logged-in YouTube or X DOM was inspected during this planning task. Candidate selectors below are starting points, not verified integrations. Stage MVP-02 records the actual mobile website variant, locale, provider, sign-in state, target markup and selector evidence. Do not invent an observed success.

Keep selector candidates and variant detection in each `targets.ts`. Feature files consume named functions such as `findPostCards`, `findPrimaryPermalink`, `findShortsCards` and `findShortsShelves`. A selector repair should not touch Rust or Java.

Prefer structural evidence and canonical links over translated visible labels. Every classifier returns a reason and an explicit `unknown` outcome. Unknown content is not automatically a match. An unsupported page layout must be reported rather than silently treated as a successful filter.

## 2. YouTube requirements and limits

Applet ID is `youtube-no-shorts`. Display name is `YouTube without Shorts`. Its entry is plain TypeScript and CSS, without React. Keep the existing player, search, subscriptions, channel pages, comments and standard video navigation.

Required suppression covers:

- Shorts navigation links, including mobile bottom navigation when present.
- Shorts-only shelves and identifiable Shorts cards on home, search, subscriptions and channel pages.
- Direct `/shorts` routes, including typed/native loads, link taps, redirects, Back/Forward and observed SPA navigation.
- Ordinary watch URLs whose video ID has already been identified as Shorts by this active instance.

"All Shorts" cannot honestly mean inferring the classification of every unseen video from its duration or aspect ratio. YouTube's classification depends on more than a short duration, and Shorts can be up to three minutes. A generic `/watch?v=...` URL may not expose classification until the page does. [YouTube classification rules](https://support.google.com/youtube/answer/15424877?hl=en).

The release report must state coverage of the named website variants and paths. If the required product promise is zero possible access to any Short under every alias, this DOM-based MVP cannot yet claim it. Do not weaken this distinction by reporting only that the Shorts menu disappeared.

## 3. YouTube implementation

### Files

| File | Responsibility |
| --- | --- |
| `applet.json` | Source origins, `/shorts` deny rule, known-ID query rule |
| `src/routes.ts` | Pure URL parsing and video-ID extraction used by creator code |
| `src/targets.ts` | Qualified variants and smallest enclosing card/shelf targets |
| `src/shorts.ts` | Classification, managed hidden markers and known-ID collection |
| `src/main.ts` | Register CSS/watchers/navigation callbacks and cleanup |
| `src/styles.css` | Scoped hiding of known targets and owned markers |

Add `queryValueRules: [{"id":"deny-known-shorts","path":"/watch","parameter":"v","setId":"short-video-ids","fallbackUrl":"https://www.youtube.com/"}]` to the source definition. `ctx.navigation.addDeniedValues("short-video-ids", ids)` registers observed IDs with the generic native evaluator. Limit each set to 10,000 entries, return QUOTA_EXCEEDED on overflow, and report reduced known-ID coverage. Do not silently evict entries. The set is instance-local and is not a durable universal Shorts database.

### Classification and hiding algorithm

1. Parse anchor URLs against the document base URL. Accept only the source's qualified YouTube hosts. A normalized `/shorts` path identifies a Shorts destination; a substring elsewhere in a URL does not.
2. Examine only qualified content-card, navigation and shelf containers. For a card, require its primary destination to be Shorts or a qualified Shorts marker. Do not hide a long-form video card merely because its description contains a link to a Short.
3. Hide the smallest supported card root with a runtime-owned marker and stylesheet rule. Hide a whole shelf only when the shelf itself is classified as Shorts-only. Never climb to and hide an arbitrary ancestor such as the feed or document body.
4. Collect IDs from positively classified Shorts links and send deduplicated bounded batches to the native deny set.
5. On content-key change or DOM reuse, remove the old managed marker before classifying the new item. Reevaluate changed hrefs and card structure. Keep unknown ordinary cards visible.

Initial candidates include links whose path is `/shorts/...`, mobile `ytm-*` card/shelf structures and desktop `ytd-*` structures if the provider actually serves them. Do not depend solely on current component tag names or CSS classes. Narrow candidates using live inspection, then retain the exact supported variant definitions in `targets.ts`.

CSS rules for structurally verified Shorts elements can hide newly inserted matches without waiting for a later observer pass. Managed markers cover cases requiring TypeScript classification. Qualify `:has()` before using it as a required selector. Do not hardcode localized labels like "Shorts" as the only detector.

### Navigation blocking

The generic native policy refuses a known blocked URL before a host-initiated load. Page capture listeners intercept supported Shorts links, including links found through the event's composed path. They prevent the default action and report the block without invoking the website's Shorts player.

Native navigation callbacks cover remaining observable redirects and same-document changes. The Rust/Wasm runtime also rechecks location before applying a mutation batch and on its route notifications. On a blocked current route, it asks native to cover the view, stop loading where possible, retire the document and load the fallback home URL. Recreating the source document stops any existing Shorts playback more reliably than merely hiding its player.

If a blocked history entry is repeatedly revisited, clear source history after the explicit recovery load and show a brief explanation. Do not redirect in a loop or use `goBack()` blindly. The ordinary-site bypass intentionally disables the applet and its rules; it is a user recovery action, not an enabled-blocker state.

These layers cannot guarantee zero transient pixels/audio before every SPA transition is detected. Measure that behavior. A recurring playable Shorts route fails the release gate. If zero-frame blocking is required and the platform cannot provide it, record a blocker instead of claiming a timer solves it.

### YouTube acceptance cases

Verify home, search, channel and subscriptions variants; delayed shelves; infinite scrolling; recycled cards; a normal video containing a Shorts link in its description; direct/redirected/history Shorts routes; navigation after sign-in; and switching between applets. Include ordinary player playback, seek, captions, fullscreen and Back. Preserve ordinary videos without duration-based false positives.

## 4. X product behavior

Applet ID is `x-bookmarks`; name is `X with Genesis bookmarks`. The source entry adds a distinct `Save to Genesis` control to a supported post. Keep X's own bookmark control untouched. The local library is accessible through the native applet menu and from the launcher even when X is unavailable.

On Save, open a dialog showing the selected post's author and excerpt. The user selects any number of categories or leaves the set empty, then chooses Save. An existing bookmark opens as Edit categories and offers Remove from Genesis. Do not toggle save/remove on the first tap, which would make category selection ambiguous.

Create, rename and delete categories. A bookmark can belong to multiple categories. `All` and `Uncategorized` are virtual filters. Deleting a category keeps its bookmarks; any bookmark with no remaining active categories appears in Uncategorized. Reject user categories whose normalized name equals either reserved filter name.

An explicit Create category action commits that category independently. Cancelling the surrounding Save dialog does not undo that creation; it only cancels the bookmark/category-membership edit. Label the action accordingly.

The library shows saved metadata, save date, category filters, Open original, Edit categories and Remove. It works offline for already saved data. Opening original content requires a working source session/network and never guarantees access to deleted or protected posts.

X's own bookmarks are an account feature. Genesis is a separate local collection and does not import, synchronize with or mutate them. [X bookmark documentation](https://help.x.com/en/using-x/bookmarks).

## 5. X extraction and mounting

Use `article[data-testid="tweet"]` as an initial candidate, then qualify the actual mobile page. Never save the first `/status/` link found anywhere inside a card. A quoted post, media link or recommended post may introduce another ID.

`extract-post.ts` must identify the primary post permalink associated with that card's main header/time, excluding nested quote content and unrelated descendant cards. Parse recognized paths `/handle/status/<decimal-id>`, `/i/status/<decimal-id>` and `/i/web/status/<decimal-id>` explicitly. Permit and strip recognized `/photo/<n>` or `/video/<n>` suffixes when normalizing a primary permalink. Strip query and fragment. Normalize accepted twitter.com aliases to x.com. Reject ambiguous or absent primary IDs.

Post ID is an opaque decimal string, never a JavaScript number. Store key is `x:post:<id>`. Canonical URL retains the normalized observed primary permalink, independent of the author's display name. Do not use the mutable handle as the bookmark identity.

Extract plain text only: author display name, optional handle, optional post time and visible excerpt. Bound excerpt to 2,048 UTF-8 bytes and author fields to 256 bytes each. Mark truncation. Do not store HTML, execute remote markup, download media or claim the snapshot is the complete thread. Refresh metadata on an explicit resave; preserve the user's categories unless they edit them.

Mount one small button in an owned Shadow DOM host next to a qualified post footer, outside existing buttons/links. Plain DOM is sufficient for each feed button; use one React root for the active save dialog. This avoids a React root per timeline item. Capture the post identity when the user opens the dialog and show that captured identity throughout the save operation.

On a recycled card, dispose the old binding and create a new one. When the card changes but the ID stays the same, refresh its current snapshot and button state. Do not let an async lookup attach a saved indicator to a different post. Stop the Genesis control's click from triggering the source card's navigation and qualify this against actual X event handling.

If the post ID is ambiguous, omit the Save button and emit a target diagnostic. The library may offer Paste post URL as a fallback for a valid observed URL. That saves a link-only bookmark with explicit missing metadata; it is not a substitute for passing the required feed integration.

## 6. X data model

All code in this section belongs in the X applet. Native storage remains generic.

```ts
interface BookmarkV1 {
  schemaVersion: 1;
  postId: string;
  canonicalUrl: string;
  authorName: string | null;
  authorHandle: string | null;
  excerpt: string;
  truncated: boolean;
  postTime: string | null;
  savedAtMs: number;
  capturedAtMs: number;
  categoryIds: string[];
  orderKey: string;
}

interface CategoryV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  normalizedName: string;
  createdAtMs: number;
  deletedAtMs: number | null;
}
```

Collections:

| Collection | Key/value |
| --- | --- |
| `bookmarks` | `x:post:<id>` to BookmarkV1 |
| `bookmark-order` | Sort key to `{bookmarkKey}` |
| `categories` | UUID to CategoryV1, including tombstones |
| `category-names` | Normalized name to `{categoryId}` |
| `category-meta` | `active` to `{ids: string[]}` |

Category IDs use `crypto.randomUUID()` in the secure source/local-page context. Names have 1 to 40 Unicode code points after trimming. Normalize with NFKC, trim, collapse whitespace, and lowercase. Enforce a maximum of 50 active categories through the compare-and-set `category-meta/active` record. Do not enforce uniqueness by an unchecked read followed by a write.

Create a category in one transaction: check meta revision, absent category UUID and absent normalized name; write the category, name index and updated meta. Rename checks the existing category and index plus absence of the new normalized index; atomically replace the index and name. If normalization is unchanged, update only the display name. Delete sets deletedAtMs, removes its name index and active ID in one transaction. Keep the category tombstone; do not scan and rewrite every bookmark.

Bookmark categories are effective only when their IDs exist in the active category set. Unknown/deleted IDs never cause bookmark deletion. On the next category edit, remove inactive IDs from that bookmark's stored selection.

## 7. Bookmark transactions and ordering

On first save, create both bookmark and order-index record atomically. Generate `orderKey` as the zero-padded, 16-digit decimal value of `Number.MAX_SAFE_INTEGER - savedAtMs`, followed by `:` and the post ID. Native key-ascending scans then return newest saves first. Reject invalid/out-of-range timestamps before generating keys. The timestamp determines ordering, not identity.

The transaction checks absence of the bookmark and order key, plus current revisions of selected active categories and category meta. On an existing save, preserve savedAtMs/orderKey and compare the bookmark revision before replacing its category set or refreshing metadata. On removal, delete bookmark and order record together with revision checks. Any conflict reloads the selected post/category state and asks the user to retry. Never overwrite category changes based on stale dialog data.

Library pagination scans `bookmark-order` in pages of 100 and reads referenced bookmarks with at most eight concurrent RPCs. Accumulate 20 matching bookmarks for the chosen category filter. Preserve the last consumed order key, including nonmatches scanned before the next result, for Load more; do not skip unconsumed rows from a fetched 100-row page. A category filter may require scanning past nonmatching records; show progress and permit cancellation. Reset the cursor on a relevant `storage.changed` event or namespace-revision change to avoid silently mixing snapshots. Missing index targets produce a diagnostic and are skipped; do not delete data automatically.

Filter membership in TypeScript using the active category set. Do not introduce X-specific SQL or a second database just to optimize the first version. Measure the 500-bookmark acceptance case before adding secondary category indexes. All/unfiltered ordering is index-driven; rare-category searches have linear scan cost and no constant-time claim.

On successful save, update every currently mounted button for that post ID through storage change notifications. Show success only after commit. On timeout, reread the bookmark before offering retry. A storage failure preserves the dialog selections and displays an error.

## 8. X acceptance cases

Verify normal posts, quote posts, repost wrappers, media-only posts, localized pages, virtualized reuse and detail routes. Confirm that Save selects the outer primary post rather than a quoted ID. Confirm that two instances of the same post show consistent Genesis state.

Exercise zero/one/multiple categories; duplicate normalized names; rename; deletion of a category used by several bookmarks; deletion of the last category; cancellation; concurrent stale dialog edits; interrupted save; offline library; app restart; APK update; and X account switch. Confirm that original X bookmark state is unchanged.

For deleted/protected posts, keep the local saved record and let the original website explain access failure. Do not infer deletion from a failed request. Test with the user's own available session during implementation; do not manufacture authentication evidence.

## User-operated sign-in

YouTube and X continue to render their original sign-in pages. The user signs into their own existing account inside Genesis's WebView; no shared website account is provided or required. Applets neither collect credentials nor manage website access tokens. Normal browser cookies persist independently of applet activation and applet data. Account switching is the original website's behavior. The X bookmark library still belongs to the local Genesis profile and must not be silently reassigned based on guessed website account identity.

A visible login page is an unauthenticated page variant, not successful authentication or a verified feed selector. Record guest inspection separately from user-confirmed feed access. A user can complete login privately on an emulator or physical device without sending secrets to the agent. If they do not do so, leave the account gate pending. The physical-device requirement is for real-site release qualification and does not force a shared account or block implementation.
