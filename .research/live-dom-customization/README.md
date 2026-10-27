# Genesis live website customization

Date: 27 October 2026. Status: revised architectural proposal. The user confirmed a Rust runtime with JavaScript/TypeScript, React and CSS creator code. No runtime implementation, Android qualification or performance experiment was performed for this document set.

## Recommendation

Build an applet as an installable customization of a running website. Keep the website's existing DOM and behavior wherever possible. Apply managed CSS and selected DOM changes, mount creator components in applet-owned containers, and let creators use ordinary page scripting when they need more control.

React is an optional way to build the new parts. It is not the mechanism for taking ownership of the website's entire DOM. Genesis's main engineering contribution is the lifecycle around these changes: locating targets, following navigation, managing effects, detecting conflicts, preserving applet data and recovering when customization fails.

The earlier architecture moved too quickly toward rebuilding the website from observed records. That remains useful for a replacement region or a dashboard combining several sources. It should not be the default for the product now described.

```text
Running website and its live DOM
    + creator CSS and managed DOM effects
    + creator-owned UI, local state and optional services
    = customized website presented as an applet
```

This is DOM-to-DOM in the useful sense: alterations to a live document over time. It is not a pure function that turns one serialized tree into another while preserving every behavior automatically.

## Reading order

| Document | Question it answers |
| --- | --- |
| [1. Research and approach selection](01-research-and-approaches.md) | Which parts of the proposition work, which alternatives exist, and why choose this one? |
| [2. Runtime architecture](02-runtime-architecture.md) | Where do Rust, creator code, the DOM and persistent data live? How do updates and conflicts work? |
| [3. Creator programming model](03-creator-programming-model.md) | What does a creator actually write? How much freedom do they have? |
| [4. Authoring and reliability workflow](04-authoring-and-reliability.md) | How does an editable project become a reusable applet, and what does "working" mean? |
| [5. Implementation roadmap](05-implementation-roadmap.md) | What code should be written first, which dependencies help, and what evidence closes each stage? |
| [6. Evidence register](06-evidence-register.md) | Which statements have upstream support, and which still need experiments? |

All `@genesis/*` imports, manifest fields and Genesis methods in these documents are proposed APIs. They do not exist yet. Example selectors describe an owned fixture, not verified YouTube markup. Numerical thresholds are proposed acceptance criteria, not results.

## Decisions changed by this clarification

| Earlier recommendation | Revised recommendation |
| --- | --- |
| Separate source and result WebViews by default | One visible website WebView with an injected customization runtime by default |
| Creator UI in Rust/Leptos | Creator JS/TS and CSS, with optional React; Genesis runtime remains Rust |
| Records are the mandatory boundary to every UI | Direct live DOM access is available; observed records are an optional convenience |
| Original player appears through source-view handoff | Keep the original player in the customized page and qualify the surrounding changes |
| Source mirror before custom rendering | No mandatory full mirror or universal tree transformation |
| Build the whole replacement interface | Start with the smallest change that delivers the creator's intent |

This set supersedes those default choices in the [earlier architecture review](../architecture-review/2026-10-27-architecture-and-build-roadmap.md), [runtime walkthrough](../rust-monorepo/2026-10-26-runtime-walkthrough.md) and [browser UI framework proposal](../applet-framework/2026-10-27-browser-runtime-and-ui-layer-framework.md). Their guidance on document identity, bounded work, persistent data and native recovery still applies. Their GEN milestones are historical alternatives, not another prerequisite roadmap.

## What the first prototype should demonstrate

A creator installs a project that changes the layout of a video watch page, hides a selected distraction, and adds a notes panel beside the existing player. The player remains the website's actual player. Notes survive navigation and app restart. Editing the applet does not require editing Genesis. The user can disable it and reload the ordinary website from native controls.

Test this first on an owned dynamic fixture and then on one named YouTube route on Android. A screenshot alone does not pass. Playback, source navigation, keyboard input, applet cleanup and recovery must work.

The broader aim includes arbitrary DOM scripting, custom services and multi-source applets. The first prototype establishes the runtime that can support these, while making no claim of universal website compatibility.
