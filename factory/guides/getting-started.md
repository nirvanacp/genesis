# Getting started

You need Node 24, the `@genesis/sdk` and `@genesis/applet-tools` packages, and for device installs a debug build of the Genesis app on a device or emulator reachable over adb.

## Create

```sh
npx genesis-applet create my-applet --origin https://example.com --name "Example"
cd my-applet
npm install
```

Name the directory after the applet, with a short product name such as `hn-bookmarks` rather than the website's domain: one applet can span several websites. `create` derives the applet id from the directory name unless you pass `--id`, and the id keys the applet's stored data and services, so keep the directory and the id the same and never rename an existing id. In a collection of applets, the directory sits in the collection's root.

The scaffold contains:

| File | Purpose |
| --- | --- |
| `applet.json` | Manifest, schema 6: one context `primary` at the origin, screen `home`, one route `/` to page `home` |
| `src/adapter.ts` | The adapter: page `home` with a `links` collection and an `open` action |
| `src/main.tsx` | The foreground: `mountForeground` and the `home` screen |
| `src/theme.css` | Light and dark tokens, and the space for the menu button |
| `.specs/`, `.changelog/` | Applet records, already started; the current spec lists the compatibility values |
| `factory/` | This kit |
| `AGENTS.md`, `README.md` | Pointers to the kit and the records |

## Develop

1. Inspect the website and write the brief in `.specs/current.md` ([product scope](product-scope.md)).
2. Declare origins, contexts, routes and screens in `applet.json` ([SDK reference](sdk-reference.md#manifest-appletjson), [navigation](navigation.md)).
3. Write the adapter's pages, regions and readiness ([adapters](adapters.md)), and the screens that render them, with their loading, stale and error states ([patterns](patterns.md), [presentation](presentation.md)).
4. Add actions for what the user does on the website ([interactions](interactions.md)), and storage or a service for applet data ([services and data](services-and-data.md)).

Add the smallest set of dependencies and capabilities the requested features need. Do not reduce features to avoid a dependency.

## Check, build, install

```sh
npm run check                                      # compatibility, manifest, TypeScript and the adapter
npm run build                                      # writes dist/ with the bundle
npx genesis-applet dev install . --device emulator-5554
npx genesis-applet dev status my-applet --device emulator-5554
```

`check` compares the applet with the tools and fails with `APPLET_INCOMPATIBLE` on a difference, then validates the manifest against schema 6, type-checks `src` and imports the adapter to confirm it declares every route's page. Importing runs the applet's code; check only applets you trust. `build` bundles the foreground and the adapter into `dist/`; `--debug` adds runtime measurements. `dev install` takes the applet directory (it uses `dist/`) or a build output directory; it does not build, so run `build` first. It copies the bundle to the debug app, which applies it without restarting Genesis, and reports the accepted revision or the rejection reason, including an incompatible SDK. `dev status` lists the installed applets with their status and, given an id, its last install receipt. Every command accepts `--json`; device commands accept `--adb <path>` and `--application <id>`.

Release builds of Genesis refuse development installs. They install the applets bundled into the APK and published releases that people add from GitHub; see [publishing](publishing.md) for versions, tags and the CI workflows.

## Hand off the kit

`npx genesis-applet kit export --out <new-directory>` writes `AGENTS.md`, `README.md`, `guides/`, `skills/`, `templates/` and `kit.json` with the matching versions. Give a coding agent the path to `AGENTS.md`.
