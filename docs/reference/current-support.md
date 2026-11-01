# Current support and limits

[Learning path](../README.md) · Reference

This describes the repository's creator workflow on 31 October 2026. Your supplied build may differ. Check its versions before using a command or feature.

## Available now

- Android browser host with an Apps list, native navigation, and original-site recovery.
- Applets that adapt one or several live websites.
- App-owned pages, optional React UI, and shared applet-local records.
- Connections to separately operated HTTPS services.
- Computer-based creation, checks, builds, and development installation through adb.
- Code replacement and rollback on compatible debug hosts.

The current creator kit targets SDK/tools `0.3.0` and runtime API `2`. Genesis maintainers supply matching package archives and a prebuilt debug APK. Ordinary applet work needs no native compiler or platform checkout.

## Example app status

Hacker News is the currently bundled applet. Its saved library uses a separate backend.

X has a development applet with custom categories and several checked emulator flows. That does not establish complete support across accounts, devices, subscriptions, or website layouts. It is not part of the current bundled package selection.

The YouTube prototype is inactive. A source folder or example idea is not a supported app release.

## Still future work

| Need | Current boundary |
| --- | --- |
| Public app distribution | Production publisher trust and distribution are unfinished; release hosts load bundled packages |
| Public npm setup | SDK/tools archives are supplied by maintainers, not published on the public registry |
| Built-in agent connection | Use your external coding tool and creator kit today |
| Always-running background collection | No persistent applet coordinator is supplied |
| Run an arbitrary server on the phone | Backends run separately |
| Automatic sync or full offline use | Must be designed per app; not supplied by adding storage |
| Read all sources at once | Each source has its own document; combine permitted records through app storage or services |

Website sign-in and paid features remain subject to that website. Current website file inputs use Android's document picker; camera and microphone access remain denied by the host.

## What "verified" should mean

A build pass, an accepted package, a running server, and a working phone journey are different results.

Ask for the exact source routes, host build, device, and workflows checked. Missing account access or an unavailable server can leave a required feature unverified even when its code exists.

**Related:** [Glossary](glossary.md) · [Troubleshooting](../maintain/troubleshooting.md).
