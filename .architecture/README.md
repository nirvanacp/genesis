# Genesis architecture

Current phase-5 architecture uses SDK/tools 0.4.1, runtime API 3 and manifest schema 2. HN and X have separate hidden source adapters and owned foregrounds. Website DOM never supplies the customized foreground layout. The framework owns an opaque native barrier, explicit website views, lifecycle and recovery.

Read [platform ownership](platform.md), [runtime and protocol](browser-runtime.md), [services/data](services-and-data.md), [HN](hacker-news.md) and [X](x.md). Applet authors use [factory](../factory/README.md), including its portable instructions and build/customize/verify skills. The [implementation plan](../.plans/phase-5/2026-10-31/171848-genesis-isolated-applet-architecture-plan.md) records requirements and material migration decisions.

The migration preserves stable applet IDs, cookie sessions and backend data. HN remains APK-selected; X remains development-installed in the existing debug host. This is two applets inside one everyday host, not separate category/source applications. Older phase-3/4 operating guides and reports qualify their recorded implementations only. Current operating guidance lives under `.docs/phase-5/`, and current acceptance evidence under `.reports/phase-5/`.

API-1/2-only indexes retain the legacy controller for maintenance. An index containing API-3 applets uses the isolated controller; legacy packages in that mixed index receive ordinary website presentation. Production publisher trust/distribution, arbitrary background servers and complete network confinement are not supplied by this migration.
