# Start an applet

This guide covers the current SDK `0.1.0` workflow. Follow [the factory instructions](../AGENTS.md). The user supplies an application idea; the coding agent supplies the technical implementation.

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

## Current repository setup

Existing applets are under `factory/applets/<directory>/`. The directory name is a convention, not a one-website restriction. A new hybrid app can use an application name instead of a domain. Its manifest ID must be unique and stable.

The repository pins Node `24.15.0`, npm `11.14.1`, TypeScript `7.0.2`, and esbuild `0.28.2`. Use the checked-in npm lockfile and installed dependencies. Existing workspace dependencies resolve `@genesis/sdk` locally. A typical applet has:

```text
my-applet/
  applet.json
  package.json
  tsconfig.json
  README.md
  src/main.ts
  src/extract.ts
  src/styles.css
  src/pages/saved.tsx      optional
  assets/brand.png        optional shell artwork
  backend/               optional separate server
```

For a new applet in the current root `factory/applets/` directory, the following configuration matches the existing workspace. These files do not register it with the build.

```json
{
  "name": "@genesis/applet-my-reader",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "typecheck": "tsc -p tsconfig.json" },
  "dependencies": { "@genesis/sdk": "0.1.0" }
}
```

```json
{
  "extends": "../../../tsconfig.base.json",
  "include": ["src", "../../../packages/sdk/src/assets.d.ts"]
}
```

For React, the current HN workspace also declares `react` and `react-dom` at `19.3.1`, and development types `@types/react` and `@types/react-dom` at `19.3.0`. Keep versions consistent with the installed SDK and lockfile. External workspaces cannot use the relative tsconfig above without the monorepo; standalone packaging is planned.

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

## Load the result today

Only HN is selected by `tools/check-packages.mjs`, and root npm workspaces are explicitly listed. Creating a directory does not add it to either list. Applet authors should hand new applet source to a Genesis maintainer for temporary bundle integration. A maintainer doing both roles must treat package selection/workspace edits as platform integration under root instructions, then rebuild and install the APK as an update. Do not silently edit those files during applet-only work.

For an existing selected applet, run [the verification commands](verification.md) and use the maintainer-supplied debug build. Standalone `create`, `build`, and `dev install` commands are not present yet. The future connector will use the platform toolchain; it will not require an agent to patch Rust for each applet.
