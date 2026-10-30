# Genesis architecture

## Phase-4 product direction

The user requires two complete everyday applets, Hacker News and one X client. Internal browser contexts, source routes, Categories, backend services and reader pages do not create additional apps. Preserve stable applet IDs and data. The [controlling improvement plan](../.plans/phase-4/2026-10-30/214048-genesis-two-complete-applets-plan.md) defines the corrective work and acceptance. The current HN-only bundle and X debug qualification described below are implementation status, not the final product. HN functionality is the preservation baseline; X requires integrated end-to-end qualification.

Current architecture, checked against code on 30 October 2026. Genesis is the maintained browser platform; applets are independently authored custom applications over one or more websites. This directory describes platform internals and integration boundaries. Applet authors start in [factory](../factory/README.md) and do not need these internal documents for ordinary customization.

Operational commands live in the [phase-3 maintenance guide](../.docs/phase-3/2026-10-30/162034-genesis-platform-maintenance.md), investigations and source provenance live in .research, and historical execution evidence lives in .reports. Archived plans are not specifications. The [phase-3 separation plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) records the implementation components and their qualification.

Read in order:

1. [Platform and ownership](platform.md).
2. [Browser runtime and protocol](browser-runtime.md).
3. [Services and application data](services-and-data.md).
4. [HN frontend and backend](hacker-news.md), a reference applet, not a platform-wide application model.

Each scope distinguishes current behavior from future work. Previous reports establish behavior only for the build they tested. The [phone report](../.reports/phase-2/2026-10-29/223320-genesis-android-phone-verification.md) qualifies specific HN/backend flows with a development tunnel; it does not qualify a deployed production backend or independent package installation.
