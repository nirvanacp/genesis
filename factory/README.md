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

This kit documents SDK `0.1.0`, manifest schema `1`, and the current bundled Android runtime, checked against source on 30 October 2026. TypeScript, managed DOM effects, optional React pages, native manifest sections, applet-scoped local documents, and declared HTTPS services exist. Sources are an array and `sources.open` can switch between them. A multi-website applet has not been qualified by this documentation task.

In this repository, applet source still lives in `factory/applets/`. HN is the only selected bundle. X and YouTube are inactive prototypes, not complete starter templates. The SDK is private, exported as TypeScript source, and resolved through the npm workspace. There is no released standalone creator CLI, downloadable authoring kit, independent applet installer, or coding-agent connector yet. A new applet can be authored now, but deploying it currently requires Genesis developer integration and an APK build.

The [phase-3 architecture plan](../.plans/phase-3/2026-10-30/162034-genesis-platform-applet-separation-plan.md) specifies the transition. It is maintainer context, not required reading for an applet author and not evidence that its commands exist.

## Handing the kit to another coding agent

Copy this entire `factory/` guidance tree, including `AGENTS.md`, `guides/`, and `skills/`, alongside the applet. Give the agent the path to `AGENTS.md`; do not assume a sibling `AGENTS.md` is auto-discovered. An agent that does not support skills can read the selected `SKILL.md` as instructions. A skill's guide links require the whole tree, so do not distribute an isolated skill file without its referenced guides.

The recipient also needs a compatible SDK dependency, their applet source, and a compatible Genesis host/build supplied by its maintainer. Documentation alone is not an executable framework distribution. Once the planned standalone packages are implemented, distribute their built artifacts with the matching version of this kit; public registry publication is a separate release action.
