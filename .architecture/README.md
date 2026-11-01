# Genesis architecture

Current phase-5 architecture uses SDK 0.5.0 / tools 0.5.0, runtime API 4 and manifest schema 3. HN and X have separate hidden source adapters and owned foregrounds. Website DOM never supplies the customized foreground layout. The framework owns an opaque native barrier, explicit website views, lifecycle and recovery.

Read [platform ownership](platform.md), [runtime and protocol](browser-runtime.md), [services/data](services-and-data.md), [HN](hacker-news.md) and [X](x.md). Applet authors use [factory](../factory/README.md), including its portable instructions and build/customize/verify skills. The [implementation plan](../.plans/phase-5/2026-10-31/171848-genesis-isolated-applet-architecture-plan.md) records requirements and material migration decisions.

The migration preserves stable applet IDs, cookie sessions and backend data. HN remains APK-selected; X remains development-installed in the existing debug host. This is two applets inside one everyday host, not separate category/source applications. Older phase-3/4 operating guides and reports qualify their recorded implementations only. Current operating guidance lives under `.docs/phase-5/`, and current acceptance evidence under `.reports/phase-5/`.

API-1/2-only indexes retain the legacy controller for maintenance. An index containing API-3/4 applets uses the isolated controller; legacy packages in that mixed index receive ordinary website presentation. Production publisher trust/distribution, arbitrary background servers and complete network confinement are not supplied by this migration.


## Explicit navigation migration

Schema 3/API 4 adds host-owned presentation decisions, declared website actions for custom URLs, native uncovered recovery and explicit website Return. SDK/tools 0.5.0 supply resolve/activate/subscribe, controls and route inspection. Existing schema-2/API-3 packages retain their execution behavior. Current X/HN use schema 3; the source receives its accepted route rather than choosing presentation with a second pathname router. See [portable navigation](../factory/guides/navigation.md). Website mode retains its own history and never automatically becomes custom on a matching URL. This policy is not outbound network confinement or malicious-author isolation.

Current navigation delivery and qualification limits: [verification report](../.reports/phase-5/2026-11-01/115202-genesis-explicit-navigation-verification.md).
