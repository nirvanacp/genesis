# Applet defaults

Apply these automatically for new apps. During customization preserve explicit existing choices and change the requested scope. Brief compatible alternatives override defaults; keep the underlying [requirements](rules.md). Record choices in [current specs](applet-records.md).

| ID | Default behavior | Acceptance and boundary |
| --- | --- | --- |
| default-platform-menu | Configure native shell with Genesis options at top right | Menu opens native settings/recovery; do not recreate these in web UI. Explicit removal is an override, subject to supported shell configuration. |
| default-mobile-identity | Use the source product's mobile/native conventions; inspect mobile website when native references are unavailable | Connected screens and new features share tokens/density. Do not copy another app's feature set. |
| default-primary-navigation | One native primary navigation system; content tabs/filters inside owned UI | Current host section selection/reselection opens declared root and resets transient viewport. Detail Back/website Return restore their opener. No promise of retained tab stacks. |
| default-contextual-motion | Host contextual reveal, brief local feedback, reduced-motion support | Avoid duplicate full-screen animations. Current host uses 120ms neutral reveal or 200ms directional 24dp reveal; these are host facts, not SDK settings. Cancellation restores usable layout. |
| default-pending-skeletons | Neutral light/dark destination-shaped static placeholders | Inspect pending and settled frames. Keep useful same-account/destination content and drafts; real errors/empty/uncertain outcomes stay readable. See [design](design.md#skeletons-are-the-default-pending-ui). |
| default-compact-website-cue | Compact external arrow with accessible "opens website" name on dense website/external controls | Cue visible before activation without collisions. Explicit original-site actions retain clear wording; cue appearance can change, truthful destination mode cannot. |
| default-refresh | Pull-to-refresh where expected, with labeled Refresh alternative | Preserve query/filter; exclude inputs, nested scrollers, horizontal tabs, media and modals. Deduplicate; wait for actual result and allow failure/cancel. Do not force gestures on unrelated forms. |
| default-transient-dismissal | Back dismisses current menu/sheet before leaving; Close/Cancel restores focus | Re-register managed handlers after source epoch/page ownership changes. Provider Return reconciles latest snapshot even without a fresh publication. Release competing handlers. |
| default-theme-and-layout | Explicit owned canvas colors/text, consistent tokens, compact readable density, opaque panels | Both themes, long text and narrow width remain readable. Inline links need not become tall rows; standalone actions remain usable. |
| default-keyboard-safe-sheets | Scrollable body, reachable Close/Cancel/confirmation and relevant warnings | Keyboard/short viewport preserves drafts and account checks; no compressed list rows or clipped footer. |

Read [navigation](navigation.md#native-shell-and-platform-options) for menu configuration. Skeleton presentation can become a spinner if requested, but readiness evidence, accessible status and deadlines remain requirements. Website cue style may change, but hidden source isolation and explicit website intent cannot. Theme/density choices must preserve accessible navigation.

These are reusable lessons from news/social clients. Exact tab counts, font sizes, brand colors, personal-account restrictions and site-specific extraction techniques are applet choices. A kit update does not authorize redesigning existing apps.
