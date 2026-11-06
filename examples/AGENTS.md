# Example applets

This folder holds the Genesis example applets used for platform testing. It is laid out like an applet repository that holds several applets: each subdirectory with `applet.json` is one applet, and `ports.json`, `start-applet-servers.sh` and `scripts/` serve the whole collection.

Follow [factory instructions](../factory/AGENTS.md), [rules](../factory/guides/rules.md) and root repository instructions. Read the selected applet's `.specs/current.md`, relevant decisions and README. Initialize missing records on first active customization under [record rules](../factory/guides/applet-records.md). Use only flat `.specs` and `.changelog`; phase-based storage applies only to platform/shared work.

Preserve stable app identities, neighboring applets and data. Update route/model/renderer and interaction mappings together. Use [isolated rendering](../factory/guides/isolated-applets.md), [navigation](../factory/guides/navigation.md) and [interactions](../factory/guides/interactions.md). Hidden source stays hidden; explicit website workflows preserve sessions and Return. Apply the shell/menu default unless overridden. Recognize clear shared intent under factory rules without promoting ordinary local preferences.
