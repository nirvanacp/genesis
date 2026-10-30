# Genesis applet factory

Build an application around the websites you use. Describe the screens and behavior you want to your coding agent; the agent uses this kit to implement the website adapters, custom UI, and application data. You do not need to know how Genesis's Android or Rust code works.

An applet can combine several websites. Each source runs in its own browser document; an applet can extract permitted data there, save applet records, and present a shared page. It cannot read another source's DOM through a global browser object. Genesis runs and navigates the websites, supplies native controls, and provides the SDK used by the applet.

## Read this first

| Need | Read |
| --- | --- |
| Give a coding agent its instructions | [AGENTS.md](AGENTS.md) |
| Start an applet or understand the current workflow | [Getting started](guides/getting-started.md) |
| Choose a capability or check a signature | [SDK and manifest reference](guides/sdk-reference.md) |
| Adapt a website, build React UI, or combine sources | [Implementation patterns](guides/patterns.md) |
| Store records or connect a backend | [Services and data](guides/services-and-data.md) |
| Check or debug the result | [Verification and maintenance](guides/verification.md) |
| Select an agent skill | [Skills](skills/README.md) |

Example request to an agent:

> Read factory/AGENTS.md. Build a reading app that lets me collect articles from two websites and organize them in one Saved page. Keep each website's login flow. First inspect the available SDK and explain any host capability that is missing; keep the implementation inside my applet.

## What is available today

This kit matches SDK/tools `0.2.0`, runtime API `1`, and bundle format/manifest schema `1`. TypeScript, managed DOM effects, optional React pages, native manifest sections, applet-local documents, declared HTTPS services, and multiple sources are available.

The standalone `genesis-applet` CLI creates, checks, and builds applets without Rust or Android compilers. A compatible prebuilt debug host accepts explicit development installation over authorized adb, including code updates and rollback. Applet code and data keep a stable ID. Release hosts load bundled packages only. Production publisher trust, public distribution, and coding-agent connectors remain future work.

Genesis maintainers supply packed SDK/tools archives and a compatible debug APK. These packages have not been published to a public registry. Example applets in this repository live under `factory/applets/`; HN is the only bundled example. X and YouTube remain inactive prototypes. See [getting started](guides/getting-started.md) for the independent workflow and [verification](guides/verification.md) for its limits.

## Handing the kit to another coding agent

Copy this entire `factory/` guidance tree, including `AGENTS.md`, `guides/`, and `skills/`, alongside the applet. Give the agent the path to `AGENTS.md`; do not assume a sibling `AGENTS.md` is auto-discovered. An agent that does not support skills can read the selected `SKILL.md` as instructions. A skill's guide links require the whole tree, so do not distribute an isolated skill file without its referenced guides.

Run `genesis-applet kit export --out <new-directory>` to export the matching guidance and `kit.json` version metadata. `create` includes it automatically under the new project's `factory/`. The recipient needs the compatible SDK/tools dependencies and a prebuilt host supplied by its maintainer. No Genesis repository, Rust compiler, or native source is required for ordinary applet creation, build, and development updates.
