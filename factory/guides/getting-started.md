# Start an applet

This guide covers the current SDK/tools `0.2.0` workflow. Follow [the factory instructions](../AGENTS.md). The user supplies an application idea; the coding agent supplies the technical implementation.

## Choose the parts of the application

| Part | Purpose | Owned by |
| --- | --- | --- |
| Source | A live website with its own DOM, scripts, cookies, and server behavior | Website; applet adapts supported routes |
| Applet page | A packaged screen such as a combined Saved library | Applet, optionally using React |
| Native shell | Sections, Back, reader controls, loading cover, recovery | Genesis, configured by manifest |
| Applet records | Settings, drafts, extracted records, application state | Applet, stored through optional SDK storage or its backend |
| Service | An applet-owned API running separately | Applet author/operator |

There is no requirement to use React or a backend. A CSS adaptation can be a small `defineApplet` entry. React is useful for applet-owned pages or controls; it does not take ownership of the website's live React tree.

Write a short brief in the applet README: purpose, supported websites/routes, screens/actions, where records live, and a few concrete acceptance flows. For example, “Save an article on either source, open Saved, and return to the article on its original source.” Do not ask a nontechnical user to choose a database or bridge protocol unless the choice changes their product constraints.

## Independent creator setup

Use Node `24.15.0` and npm `11.14.1`. Obtain `genesis-sdk-0.2.0.tgz`, `genesis-applet-tools-0.2.0.tgz`, and a compatible prebuilt Genesis debug APK from the platform maintainer. The archives include the executable framework, types, and matching agent kit. They are not currently published to the public npm registry.

Install the tools archive in a local tools directory or through your agent's package workflow. For example, from an empty tools directory:

```sh
npm install /absolute/path/genesis-applet-tools-0.2.0.tgz
npx --no-install genesis-applet create /absolute/path/my-reader --id my-reader --name "My reader" --source https://example.com/ --react
```

Then, from the created applet directory, install the exact SDK/tools archives and the generated React dependencies:

```sh
npm install /absolute/path/genesis-sdk-0.2.0.tgz /absolute/path/genesis-applet-tools-0.2.0.tgz
npm run check
npm run build
```

Commit the resulting applet lockfile with your applet source. `create` writes code/configuration and guidance only; it does not install dependencies, run a backend, or connect a device. Omit `--react` for a source-only starter. Its example reading style does not implement a website-specific workflow until the agent inspects that website and writes the adapters.

The generated independent `tsconfig.json` includes strict DOM/ES2022 and optional TSX settings; it has no path into Genesis source. CSS text declarations live inside the applet. React `19.3.1`, React DOM `19.3.1`, and their matching current types are generated only when requested.

A typical applet contains:

```text
my-reader/
  AGENTS.md              forwards to the applet instructions
  factory/               matching guides and skills, no platform source
  applet.json
  package.json
  package-lock.json
  tsconfig.json
  README.md
  src/main.ts
  src/styles.css
  src/home.tsx           optional owned React page
  assets/brand.png       optional shell artwork
  backend/               optional separate server
  dist/                  generated bundle, ignored by Git
```

The applet ID is stable application identity, even when several websites are sources. In Genesis's development monorepo, examples live under `factory/applets/`. Maintainers choose APK bundles in `genesis.packages.json`; external creators use development installation without changing that selection.

## Minimal source adaptation

This example targets the public example domain solely to demonstrate the contract. Replace the origins, routes, and content behavior with inspected target-site requirements.

```json
{
  "schemaVersion": 1,
  "id": "my-reader",
  "name": "My reader",
  "dataSchemaVersion": 1,
  "sources": [{
    "id": "primary",
    "startUrl": "https://example.com/",
    "origins": ["https://example.com"],
    "entry": "src/main.ts",
    "homePaths": ["/"],
    "customizedPaths": ["/"],
    "navigationRules": []
  }],
  "pages": [],
  "actions": [],
  "capabilities": ["dom"]
}
```

```ts
import { defineApplet } from "@genesis/sdk";

export default defineApplet({
  activate(context) {
    context.styles.add("reader-text", "body { line-height: 1.6; }");
  },
});
```

Every declared entry must default-export `defineApplet(...)` or `definePage(...)`. The build wraps it with the SDK bootstrap; do not call bootstrap yourself. Source styles affect the source document. CSS imported as text must be added explicitly through managed styles or inside an owned Shadow DOM root.

## Add an applet-owned page

Add `{ "id": "saved", "entry": "src/pages/saved.tsx" }` to `pages`. Add a manifest action `{ "id": "saved", "label": "Saved", "pageId": "saved" }` or a shell section to expose it. `context.pages.open("saved")` opens it from applet code.

```tsx
import { definePage } from "@genesis/sdk";
import { mountReact } from "@genesis/sdk/react";

export default definePage({
  mount(context, container) {
    return mountReact(context, container,
      <main><h1>Saved</h1><p>No articles saved yet.</p></main>);
  },
});
```

For real records, render an initial loading state and fetch after mount. Only display an empty state after a successful read. Return the `mountReact` promise so Genesis can wait for the initial commit before revealing the page.

## Load and update the application

The host must already be installed, compatible with runtime API 1, and debuggable. Use an authorized Android device selected explicitly by serial. The creator needs adb, not native compilers or Genesis source. From the applet directory:

```sh
npx --no-install genesis-applet dev status --device emulator-5554 --json
npx --no-install genesis-applet dev install dist --device emulator-5554 --json
```

Open the applet from Genesis's Apps list. After changing code, run check/build and install with `--replace`. If declared origins, capabilities, or service IDs change, the tool prints their exact diff and requires `--allow-permission-change` as well. Keep the same applet ID to retain its records and service connections.

```sh
npm run check
npm run build
npx --no-install genesis-applet dev install dist --device emulator-5554 --replace --json
npx --no-install genesis-applet dev rollback my-reader --device emulator-5554 --json
```

Rollback selects previous compatible code; it does not rewind application data. Package acceptance is separate from source UI/backend readiness. Installation restarts the host, so preserve unsaved work first. On an unknown-status error, read `dev status` before retrying. Release hosts ignore development packages; public publisher distribution and agent-specific connectors are outside this workflow.

All commands support `--json` for one machine-readable result, diagnostics on stderr, and exit 0 for success, 1 for execution/validation failure, or 2 for usage errors. Device commands also support `--application <host-id>` and `--adb <executable>`. Read [services/data](services-and-data.md) for explicit service startup, and [verification](verification.md) before handing off.
