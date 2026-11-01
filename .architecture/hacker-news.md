# Hacker News applet architecture

`factory/applets/news.ycombinator.com` is the schema-3/API-4 HN reference applet, stable ID `hn-bookmarks`. Native Home, Search, Post, Saved and Me IDs are preserved. Its backend remains a separate Node/SQLite process; existing bookmarks/categories and host records are not reset by rendering migration.

The shared route inventory maps feeds, discussions/comments, users/lists and information to owned renderers, and forms/account actions to explicit website presentation. `src/main.ts` publishes bounded validated stories, comments, rich-text parts, profile fields and observed account state. It recognizes both discussion comment rows and standalone new-comments rows. Parent/context/story/author links retain safe canonical identities; hidden form tokens and logout URLs are not published.

`src/app.tsx` renders all custom content separately from source DOM. It owns loading/error/auth/unsupported states, discussion collapse, internal links, save entrypoints and website recovery. A bounded public-page cache preserves the last loaded same-source/URL content with a stale notice on failed refresh; account pages are excluded. Source CSS and source-mounted account/draft controls were retired.

Saved reuses the existing backend/category/repository modules under createOwnedScope. The owned dialog has a scrollable body and visible action footer. Category names retain NFKC/whitespace/case normalization, revision checks, uniqueness and existing limits. Category deletion preserves saved stories; no remaining active membership means Uncategorized. Backend writes and reads remain authoritative. The generic native host does not know HN collections.

Post/reply/login/account forms stay in the website provider, preserving exact sessions and live fields until the user leaves. Native Stay/Leave protects edited fields. Legacy public draft records remain stored but are not injected into source forms; arbitrary durable form restoration or POST replay is not supplied. Search remains its existing documented placeholder. External story destinations use the bridge-free reader with Close back to the applet.

The service is a personal single-token database with HTTPS and operator-managed startup/tunnels. It is not a production multi-user account system. Existing import/migration tools preserve explicit data authority. See factory services guidance and the applet README for setup. Phase-5 reports record actual feed/comment/profile/Saved/provider/offline checks; older phone/API-2 reports apply only to their recorded revisions.

Missing content anchors and unfinished profile/discussion markup remain loading until validated content or the framework deadline. Invalid route parameters still produce unsupported outcomes; successful empty structures remain distinct from failed reads.


## Explicit navigation migration

Schema 3/API 4 adds host-owned presentation decisions, declared website actions for custom URLs, native uncovered recovery and explicit website Return. SDK/tools 0.5.0 supply resolve/activate/subscribe, controls and route inspection. Existing schema-2/API-3 packages retain their execution behavior. Current X/HN use schema 3; the source receives its accepted route rather than choosing presentation with a second pathname router. See [portable navigation](../factory/guides/navigation.md). Website mode retains its own history and never automatically becomes custom on a matching URL. This policy is not outbound network confinement or malicious-author isolation.
