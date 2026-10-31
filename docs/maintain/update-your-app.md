# Update your app safely

[Learning path](../README.md) · Keep improving an app

Change the existing applet when you want to improve it. Keep its applet ID so it continues using the same records and service connections.

## Give a focused request

> Read factory/AGENTS.md. Increase story spacing in My reader. Keep its applet ID, saved data, supported routes, and navigation. Check the changed page and its return flow. Report any behavior you could not verify.

For larger changes, list the journeys to preserve. Ask for a backup before changing record formats or moving data.

## Check, build, replace

Save unsaved work in Genesis. From the applet folder, your agent runs:

```sh
npm run check
npm run build
npx --no-install genesis-applet dev install dist --device emulator-5554 --replace --json
```

Replace the serial. Installation restarts the host. Keep the source and lockfile in version control; generated `dist` files are build output.

If origins, capabilities, or service IDs changed, installation reports the permission difference. Ask the agent to explain it. An intentional change also needs `--allow-permission-change`; do not add that flag merely to hide an unexplained error.

## Try the old and new behavior

Open the app from Apps. Check your change, ordinary browsing, existing saved records, and Back navigation.

A service status or install receipt does not establish that those journeys work.

## If the new code breaks

On a compatible debug host, select previous compatible code with:

```sh
npx --no-install genesis-applet dev rollback my-reader --device emulator-5554 --json
```

Use the real applet ID. A previous compatible revision must be available. Inspect `dev status` if the outcome is unclear.

Rollback changes code, not application data. A new data format may need its own recovery plan.

## Websites change too

If an untouched app suddenly loses controls, the source website may have changed. Ask the agent to inspect the affected page and repair its adapter while preserving records and account behavior.

**Next:** [Troubleshooting](troubleshooting.md).
