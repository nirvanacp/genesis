# Genesis product intent

Genesis should let a person describe the application they want and use a coding agent to build it over the websites they already use. The result should behave like a native application while a running browser preserves website sessions, rendering, and source behavior underneath.

There are two separate products to maintain. Genesis is the browser platform and its public authoring framework. Applets are custom applications built on that framework. Genesis developers maintain generic browser capabilities, lifecycle, recovery, native navigation, and tooling. Applet authors own website adapters, screens, workflows, application records, and optional backends. A developer can switch roles in the same repository without merging those responsibilities.

An applet may combine multiple websites. Its identity is the user's application, not one domain. The current model uses document-scoped source adapters and owned UI, with optional shared applet records or services. A persistent background coordinator, arbitrary phone backend execution, and cross-site DOM access are not current capabilities.

Users should need product intent and their applet code, not Genesis's Android/Rust history. The [factory](../factory/README.md) supplies the coding-agent context. Future connectors for coding tools should expose the same public framework and development commands, rather than embedding knowledge of host internals into every agent. The [separation plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) defines the code work needed before that independent workflow is available.

The broader aim is personal control over everyday software, including useful automation and custom behavior. Control requires clear data ownership and capability boundaries; private or customized code alone is not a security guarantee. Ordinary DOM/CSS customization and optional React UI remain the approach. A pure Source DOM to Result DOM transformation, an engine fork, and a mandatory dual-WebView design are not requirements.

Current technical boundaries live in [architecture](../.architecture/README.md). Root [AGENTS.md](../AGENTS.md) governs platform/repository work; [factory/AGENTS.md](../factory/AGENTS.md) supplies applet-specific instructions. Performance, source compatibility, isolation, distribution, and offline behavior need evidence for the actual build and device.
