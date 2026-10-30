# Genesis launcher visibility

The debug host now advertises `packageVisibility:true` in `dev status`. Use `node packages/applet-tools/src/cli.mjs dev visibility <installed-id> --hidden true --device <serial> --json` from repository root to hide a diagnostic entry without deleting code, records or services. Use `--hidden false` to show it. Read installed IDs from status, never infer them from display labels.

The command checks the current revision and restarts the host. Inspect status after a timeout before retrying. Each entry includes `hidden`. Visibility survives code updates and rollback because it is stored independently from revision pointers. Release hosts ignore private visibility metadata. Hidden IDs cannot be restored as the active startup destination.

On emulator-5554, external-reader, hybrid-isolation, hybrid-reader and x-ui-qualification are hidden. hn-bookmarks and x-bookmarks are visible. These two existing applet identities retain their records and services. The X entry remains a development revision while real authenticated acceptance is blocked by the upstream login restriction.
