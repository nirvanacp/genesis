# Getting started

You need Node 24, the `@genesis/sdk` and `@genesis/applet-tools` packages, and for device installs a debug build of the Genesis app on a device or emulator reachable over adb.

## Create

```sh
npx genesis-applet create my-applet --origin https://example.com --name "Example"
cd my-applet
npm install
```

The scaffold contains:

| File | Purpose |
| --- | --- |
| `applet.json` | Manifest, schema 5: one source `main`, screens `home` and `unsupported`, one route |
| `src/sources/main.ts` | The adapter for source `main` |
| `src/main.tsx` | The foreground: `mountForeground` and the two screens |
| `src/theme.css` | Light and dark tokens |
| `.specs/`, `.changelog/` | Applet records, already started |
| `factory/` | This kit |
| `AGENTS.md`, `README.md` | Pointers to the kit and the records |

## Develop

1. Inspect the website and write the brief in `.specs/current.md` ([product scope](product-scope.md)).
2. Declare origins, sources, routes and screens in `applet.json` ([SDK reference](sdk-reference.md#manifest-appletjson)).
3. Write an extractor per adapted route and the screens that render them ([patterns](patterns.md)).
4. Add intents for actions ([interactions](interactions.md)), and storage or a service for applet data ([services and data](services-and-data.md)).

Add the smallest set of dependencies and capabilities the requested features need. Do not reduce features to avoid a dependency.

## Check, build, install

```sh
npm run check                                      # manifest, files and TypeScript
npm run build                                      # writes dist/ with the bundle
npx genesis-applet dev install . --device emulator-5554
npx genesis-applet dev status my-applet --device emulator-5554
```

`check` validates the manifest against schema 5 and type-checks `src`. `build` bundles the foreground and each adapter. `dev install` takes the applet directory (it uses `dist/`) or a build output directory; it does not build, so run `build` first. It copies the bundle to the debug app, which applies it without restarting Genesis, and reports the accepted revision or the rejection reason. `dev status` lists the installed applets and, given an id, its last install receipt. Every command accepts `--json`; device commands accept `--adb <path>` and `--application <id>`.

Release builds of Genesis load only the applets bundled into the APK and refuse development installs.

## Hand off the kit

`npx genesis-applet kit export --out <new-directory>` writes `AGENTS.md`, `README.md`, `guides/`, `skills/` and `kit.json` with the matching versions. Give a coding agent the path to `AGENTS.md`.
