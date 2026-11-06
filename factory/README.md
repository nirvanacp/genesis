# Genesis applet factory

Start with [explicit navigation](guides/navigation.md) for SDK 0.5.1/tools 0.5.0, schema 3/API 4, route coverage and marked website actions. Existing schema-2/API-3 packages retain compatibility.

Build an application around the websites you use. Describe the screens and behavior you want to your coding agent; the agent uses this kit to implement the website adapters, custom UI, and application data. You do not need to know how Genesis's Android or Rust code works.

An applet can combine several websites. Each source runs in its own browser document; an applet can extract permitted data there, save applet records, and present a shared page. It cannot read another source's DOM through a global browser object. Genesis runs and navigates the websites, supplies native controls, and provides the SDK used by the applet.

Agents start with [instructions](AGENTS.md), [rules](guides/rules.md), [defaults](guides/defaults.md) and [applet records](guides/applet-records.md). Read [the isolated source/foreground architecture](guides/isolated-applets.md) for implementation. New applets declare mandatory route contracts and render custom UI in a separate owned foreground. Website views are explicit host-managed sessions.

## Read this first

| Need | Read |
| --- | --- |
| Give a coding agent its instructions | [AGENTS.md](AGENTS.md) |
| Preserve the intended app and resolve ambiguous requests | [Product scope and clarification](guides/product-scope.md) |
| Start an applet or understand the current workflow | [Getting started](guides/getting-started.md) |
| Choose a capability or check a signature | [SDK and manifest reference](guides/sdk-reference.md) |
| Adapt a website, build React UI, or combine sources | [Implementation patterns](guides/patterns.md) |
| Match the source product's mobile design and verify interactions | [Applet design and interaction fidelity](guides/design.md) |
| Store records or connect a backend | [Services and data](guides/services-and-data.md) |
| Restart local applet backends after a reboot | [Local startup and port assignments](guides/services-and-data.md#local-startup-and-port-assignments) |
| Check or debug the result | [Verification and maintenance](guides/verification.md) |
| Select an agent skill | [Skills](skills/README.md) |

Example request to an agent:

> Read factory/AGENTS.md. Build an app for https://example.com with [desired features or UI changes].

Agents should work from an ordinary product request without requiring a technical specification from the user. One requested application keeps its sources, pages, custom features and services inside that application. Agents ask focused questions when unresolved intent would change what is delivered, and choose routine implementation details themselves. A compact app brief and real acceptance journeys keep incremental work aligned with the requested result. These instructions reduce avoidable mistakes; they do not guarantee that one prompt can overcome missing source access or host capabilities.

## What is available today

In this monorepo, run `./examples/start-applet-servers.sh` from the Genesis root to start all local applet backends. For Android access after a computer/device restart, run `./examples/start-applet-servers.sh --device <adb-serial>` to restore tunnels and service connections too. Each applet also has its own `start.sh`. These are operator commands. Coding agents maintain them and use static checks; agents must not execute startup scripts or start services unless the user explicitly asks them to run services. See the services guide for prerequisites, storage, shutdown and port reservations.

This kit matches SDK `0.5.1` / tools `0.5.0`, runtime API `4`, bundle format `1` and manifest schema `3`. TypeScript, managed DOM effects, optional React pages, native manifest sections, applet-local documents, declared HTTPS services, and multiple sources are available.

The standalone `genesis-applet` CLI creates, checks, and builds applets without Rust or Android compilers. A compatible prebuilt debug host accepts explicit development installation over authorized adb, including code updates and rollback. Applet code and data keep a stable ID. Release hosts load bundled packages only. Production publisher trust, public distribution, and coding-agent connectors remain future work.

Genesis maintainers supply packed SDK/tools archives and a compatible debug APK. These packages have not been published to a public registry. Example applets in this repository live under `examples/`; HN is currently bundled. HN and X are migrated to the isolated architecture and have authenticated/public-source emulator qualification recorded in their current phase-5 evidence. X remains development-installed and YouTube remains inactive. The product has two everyday applets, HN and X. Internal sources/pages and verification packages are not separate product apps. See [getting started](guides/getting-started.md) for the independent workflow and [verification](guides/verification.md) for its limits.

## Handing the kit to another coding agent

Copy this entire `factory/` guidance tree, including `AGENTS.md`, `guides/`, and `skills/`, alongside the applet. Give the agent the path to `AGENTS.md`; do not assume a sibling `AGENTS.md` is auto-discovered. An agent that does not support skills can read the selected `SKILL.md` as instructions. A skill's guide links require the whole tree, so do not distribute an isolated skill file without its referenced guides.

Run `genesis-applet kit export --out <new-directory>` to export the matching guidance and `kit.json` version metadata. `create` includes it automatically under the new project's `factory/`. The recipient needs the compatible SDK/tools dependencies and a prebuilt host supplied by its maintainer. No Genesis repository, Rust compiler, or native source is required for ordinary applet creation, build, and development updates.
