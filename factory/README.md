# Genesis applet factory

Build an application around the websites you use. Describe the screens and behavior you want to a coding agent; the agent uses this kit to write the page code, the custom UI and the application data. You do not need to know how Genesis's Android or Rust code works.

An applet is a web UI, in any web framework, over one or more live website sessions. The UI reads the pages of those sessions into records through the Genesis page agent, with JSON read specifications or an optional page module of readers and commands, and runs inputs such as clicks and fills on the hidden page. It renders the records as native-feeling screens, keeps applet records and talks to an optional backend. Pages the applet does not customize appear as the website itself, in the same session and history. Genesis runs the websites, draws the floating Genesis menu button and the website bar, and passes Android Back to the UI. The router helper decides when a page shows as the applet or as the website, unless the applet sets its own rules.

Example request to an agent:

> Read factory/AGENTS.md. Build an app for https://example.com with [desired features or design].

## Read this first

| Need | Read |
| --- | --- |
| Give a coding agent its instructions | [AGENTS.md](AGENTS.md) |
| Requirements, defaults and how to resolve conflicts | [Rules](guides/rules.md), [defaults](guides/defaults.md) |
| Keep the intended app and resolve ambiguous requests | [Product scope](guides/product-scope.md) |
| Create, build and install an applet | [Getting started](guides/getting-started.md) |
| Look up a client method, a hook, a router option or a manifest field | [SDK reference](guides/sdk-reference.md) |
| Read pages and run inputs on them: locators, read specifications, watches and operations | [Page control](guides/page-control.md) |
| Write readers and commands for pages that need code | [Page modules](guides/page-modules.md) |
| Build the UI with another framework or an existing project | [Frameworks](guides/frameworks.md) |
| Implement a client in another language from the message format | [Protocol](guides/protocol.md) |
| Move between screens, tabs and the website | [Navigation](guides/navigation.md) |
| Make buttons perform website actions | [Interactions](guides/interactions.md) |
| Post with photos, save, share, play fullscreen, open apps, answer website dialogs, all inside the applet | [Website features](guides/website-features.md) |
| Show loading, stale and error states, and the switch to the website | [Presentation](guides/presentation.md) |
| Animate screen changes, loaders and the feedback after each tap | [Motion](guides/motion.md) |
| Lay out an applet's code and screens | [Patterns](guides/patterns.md) |
| Match the source product's mobile design | [Design](guides/design.md) |
| Store records or connect a backend | [Services and data](guides/services-and-data.md) |
| Check and debug the result | [Verification](guides/verification.md) |
| Sign in to test accounts during checks | [Test accounts skill](skills/genesis-test-accounts/SKILL.md) |
| Keep applet specs and change records | [Applet records](guides/applet-records.md) |
| Publish versions that people add from GitHub | [Publishing](guides/publishing.md) |
| Pick an agent skill | [Skills](skills/README.md) |

Agents work from an ordinary product request. They ask focused questions when unresolved intent would change the result and choose routine implementation details themselves. A short product brief and real acceptance journeys keep incremental work aligned. These instructions reduce avoidable mistakes; they cannot overcome missing website access or a capability the host does not have.

## What is available

This kit matches SDK 0.0.0, tools 0.0.0, manifest schema 6, bundle format 3, protocol 1, page control API (`adapterApi`) 1. `kit.json` in an exported copy records the same versions. Applets have up to three website contexts, a UI built with any web framework, an optional page module with readers and desired-state commands, routes and overlay screens declared in code through the router helper, applet document storage and declared HTTPS services. Genesis refuses an applet built for other versions, and the tools report the difference.

The `genesis-applet` CLI creates, checks and builds applets with Node only. A debug build of the Genesis app accepts development installs over adb and applies them without restarting. Release builds install applets bundled into the APK and applets that people add from a public GitHub repository, whose releases CI rebuilt and compared with the committed build ([publishing](guides/publishing.md)). Publisher signing does not exist yet.

## Handing the kit to another coding agent

Copy the whole `factory/` tree (`AGENTS.md`, `README.md`, `guides/`, `skills/`, `templates/`) next to the applet and give the agent the path to `AGENTS.md`. Do not assume the agent discovers it on its own. An agent without skill support can read a `SKILL.md` as plain instructions. Skills link to the guides, so never hand over a skill file without the tree.

`genesis-applet kit export --out <new-directory>` writes this tree plus `kit.json`. `genesis-applet create` includes it under the new applet's `factory/`. The recipient also needs the matching SDK and tools packages and a debug Genesis APK from a Genesis maintainer. Neither the Genesis repository nor Rust or Android compilers are needed to create, build or install an applet.
