# Genesis research consolidation

Scope: the entire previous .research corpus, the existing guides, and the original product note. The selected architecture is a browser customization platform with applet-owned frontend and separately operated backend code. The HN backend lives under its applet directory. This document records consolidation decisions; it is not a new implementation plan.

## Corpus disposition

Every previous research file is listed below. Superseded files are removed from the active tree. Their complete text remains in Git history before this change. All external Markdown source links are retained in the source register. Architecture is consolidated by scope under .architecture rather than duplicated in research.

| Previous file | Lines | Disposition |
| --- | ---: | --- |
| `.research/phase-2/README.md` | 13 | Replaced navigation and supersession chains with one current reading guide. |
| `.research/live-dom-customization/05-implementation-roadmap.md` | 143 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/live-dom-customization/04-authoring-and-reliability.md` | 113 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/live-dom-customization/06-evidence-register.md` | 71 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/live-dom-customization/README.md` | 54 | Replaced navigation and supersession chains with one current reading guide. |
| `.research/live-dom-customization/01-research-and-approaches.md` | 117 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/live-dom-customization/03-creator-programming-model.md` | 235 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/live-dom-customization/02-runtime-architecture.md` | 143 | Retained managed DOM effects and lifecycle reasoning; moved architecture into .architecture; replaced Wasm-first and pending-MVP assumptions with the current TS host and independent backend boundary. |
| `.research/customizable-browser-applets/2026-10-24-technical-analysis.md` | 351 | Merged useful rendering comparisons, browser constraints, and upstream sources; removed obsolete defaults and duplicated product explanations. |
| `.research/applet-framework/2026-10-27-browser-runtime-and-ui-layer-framework.md` | 298 | Merged useful rendering comparisons, browser constraints, and upstream sources; removed obsolete defaults and duplicated product explanations. |
| `.research/applet-framework/2026-10-26-architecture-options.md` | 269 | Merged useful rendering comparisons, browser constraints, and upstream sources; removed obsolete defaults and duplicated product explanations. |
| `.research/rust-monorepo/2026-10-26-codebase-design.md` | 230 | Removed conflicting mirror, dual-view, Rust-only creator, and obsolete milestone prescriptions. Current architecture and future research are separate. |
| `.research/rust-monorepo/2026-10-26-dependencies.md` | 85 | Replaced speculative crate inventory with actual manifests and retained upstream references. |
| `.research/rust-monorepo/2026-10-26-runtime-walkthrough.md` | 333 | Removed conflicting mirror, dual-view, Rust-only creator, and obsolete milestone prescriptions. Current architecture and future research are separate. |
| `.research/source-dom-react/2026-10-26-architecture.md` | 273 | Removed conflicting mirror, dual-view, Rust-only creator, and obsolete milestone prescriptions. Current architecture and future research are separate. |
| `.research/source-dom-react/2026-10-26-research.md` | 215 | Merged useful rendering comparisons, browser constraints, and upstream sources; removed obsolete defaults and duplicated product explanations. |
| `.research/source-dom-react/2026-10-26-roadmap.md` | 145 | Removed conflicting mirror, dual-view, Rust-only creator, and obsolete milestone prescriptions. Current architecture and future research are separate. |
| `.research/architecture-review/2026-10-27-architecture-and-build-roadmap.md` | 459 | Removed conflicting mirror, dual-view, Rust-only creator, and obsolete milestone prescriptions. Current architecture and future research are separate. |

## Conflicts resolved

- Creator frontend code is JavaScript/TypeScript and optional React. Native Rust remains the generic host. Browser Wasm is optional future work, not the active HN runtime.
- Incremental modification of the original DOM is the default. Full DOM mirroring, separate result views, Leptos-only creator APIs, and an engine fork are alternatives, not prerequisites.
- Applet-owned data is authoritative in the applet backend for the migrated HN use case. Generic Genesis local storage remains an optional platform capability, not a mandatory application database.
- A remote service uses its own authentication and data. Website cookies and account sessions remain in the website's browser context.
- Build success, local backend checks, old emulator acceptance, and new device qualification are different evidence classes.
- Independent installation and a longer-lived application execution context remain future work. The current APK still bundles its selected applet.
- Local metadata persistence does not imply article caching. The migrated HN library requires backend connectivity; it no longer promises offline use.
- Plans are renamed to .archive.md without content edits. They are historical records and must not drive implementation.

## Document precedence

Human instructions, applicable AGENTS.md, current .architecture, current operational .docs, then .research questions and source references. Code is the implementation evidence. Historical reports describe the revision they tested. Archived plans and superseded research are not active specifications.

Historical reports are preserved as evidence, including their original links and wording. For links into removed research or former plan filenames, use this inventory or Git history. Do not reinterpret old successful local SQLite tests as remote-backend acceptance.
