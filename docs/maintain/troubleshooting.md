# Troubleshooting

[Learning path](../README.md) · Find the next useful check

Save unsaved work before reloading or changing an installed package. Keep records and credentials intact while investigating.

## I cannot find my app

Ask your agent to inspect:

```sh
npx --no-install genesis-applet dev status --device emulator-5554 --json
```

Use your device serial. Check the intended applet ID, installed revision, compatible debug host, and visibility. A release host ignores development imports.

Current debug hosts can support hiding launcher entries. If yours reports `packageVisibility`, your agent can restore an accidentally hidden app with the supported visibility command. Hiding an app does not delete it or its data.

## A page will not load

Check the connection and try **Retry page**. If the website itself is unavailable or blocks sign-in, a layout repair will not fix that access problem.

If only the customization fails, try **Applet options → Recovery → Open ordinary site**. Tell your agent whether the original page works.

## A button disappeared or acts on the wrong item

Report the page URL, expected item, action, and actual result. The website may have changed its layout or reused a list row.

Ask the agent to inspect the real source and verify that the control belongs to the correct item. Avoid repeated save actions while the result is uncertain.

## My collection will not load

An unavailable library is different from an empty one. Check whether this app needs a backend.

For a local backend, use the startup instructions in the app README. After reboot or reconnection, it may need the device startup command again. A running process alone does not prove that Android can reach it.

Do not clear the app's data or create a new applet ID to fix a connection error.

## Text, overlays, or video look wrong

If available, try **Applet options → Rendering → Hardware acceleration**. Record whether it helps and which app/device is affected.

If the problem persists, report it with the website URL and a screenshot that contains no private information.

## Give the agent a useful report

Copy this and fill it in:

```text
App and device:
Genesis build and app revision, if known:
Page or section:
Steps to reproduce:
Expected result:
Actual result or error text:
Does the ordinary website work?
Does the feature need a backend, and is it reachable?
```

Never include passwords, cookies, or service tokens. If account access blocks verification, ask the agent to report that as blocked rather than claim a fix is verified.

**Next:** [Current support and limits](../reference/current-support.md).
