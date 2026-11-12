# Frameworks

The UI of an applet is an ordinary web app. Genesis loads its HTML file from the bundle into the UI WebView, and the app talks to Genesis through `@genesis/sdk`. Any framework that builds to static HTML, JavaScript and CSS works. This guide covers the two ways `genesis-applet build` builds a UI, what it checks in the output, and a complete Vite and Vue applet.

The page side does not change with the framework. `page.js` is always built by the tool from the page agent and the optional `build.page` module, which stays plain TypeScript (see [page modules](page-modules.md)).

## Two templates

`genesis-applet create <dir> --id <id> --origin https://host` writes a working applet from one of two templates.

| Template | UI entry | What it uses |
| --- | --- | --- |
| `react` (the default) | `src/main.tsx` | React through `mount` and the hooks of `@genesis/sdk/react` |
| `vanilla` | `src/main.ts` | TypeScript without a framework, through `connect` from `@genesis/sdk` and `createRouter` from `@genesis/sdk/router` |

Both templates use `build.foreground: { entry }`, so the tool bundles the UI with esbuild and no other build tool is needed. Start from `vanilla` when you plan to bring another framework and want a small example of the client and router without React.

## Two ways to build the UI

The `build` section of `applet.json` names how the UI is built. It never enters the bundled manifest.

### A source entry

```json
"build": { "foreground": { "entry": "src/main.tsx" }, "page": "src/page.ts" }
```

The tool bundles `entry` with esbuild into `foreground.js`, as a classic script (format `iife`, target ES2022, the automatic JSX runtime). CSS that the code imports becomes `foreground.css`. Imported `.svg`, `.png` and `.woff2` files are written as `assets/<name>-<hash>`, and the applet's own `assets/` directory is copied into the bundle as it is. The tool then writes the HTML file that `foreground.entry` names, with a `<div id="root">`, the CSS and the script. You do not write an HTML file in this mode.

Because the script is classic, top-level `await` does not work. Wrap startup in an async function, as both templates do. Other file types, such as `.jpg` or `.ttf`, need a file in `assets/` referenced by a relative URL.

### A project build command

```json
"build": { "foreground": { "command": "npx vite build", "dir": "web" } }
```

The tool runs `command` in the applet directory through the shell, then takes every file in `dir` as the UI. `dir` must exist after the command runs, stay inside the applet directory and not be inside `backend/`. The HTML file that `foreground.entry` names (usually `index.html`) must be at the top of `dir`. Use this form for Vite, a framework's own CLI, or a project you already have.

Pick an output directory other than `dist/`. `genesis-applet build` writes its own output to `dist/` and refuses to replace a directory it did not create. Add the output directory to `.gitignore`.

### Type checking

`genesis-applet check` type checks the applet. When `build.check` is declared, that command runs instead of `tsc`, for example `"check": "npx vue-tsc --noEmit"`. Otherwise `tsc -p tsconfig.json --noEmit` runs when the applet has a `tsconfig.json`, and no type check runs when it has neither. `check` does not run the foreground build command; `build` runs `check` first and then the command.

## What the build checks

`genesis-applet build` refuses a UI that Genesis could not serve. Each check fails with a message that names the file.

| Check | Rule |
| --- | --- |
| Relative URLs | An HTML file may not have a `src=` or `href=` value that starts with `/`. Genesis serves the UI from a revision directory, so every URL must be relative. A Vite project sets `base: "./"`. |
| File names | Every path segment uses only `A-Z a-z 0-9 . _ -`, does not start with a dot, and is at most 256 characters. A build that writes `.vite/` or other dot directories into the output fails. |
| No symlinks | The output directory may not contain symbolic links. |
| Reserved names | The UI may not write `page.js` or `bundle.json`, and no two files may share a path. |
| Required files | The bundle must contain `index.html`, the HTML file that `foreground.entry` names, and `page.js`. |
| Size | The import file that `dev install` and the APK carry must stay under 64 MiB, with binary files encoded as base64. |

Run `npx genesis-applet build .` and read `dist/revision/` to see exactly what Genesis will load.

## Routing

Genesis decides which screen shows from the website's URL in each context, not from the UI's own URL. The UI document always stays at its HTML file. Render screens from `@genesis/sdk/router` (`router.screen()` returns `{ key, id, params, context, overlay }`) or from `useRouter` in React. A framework router that reads or writes `location.pathname` or the hash does not see the website's navigation and breaks Back, so do not use one for screens. If a component library needs a router instance, give it an in-memory history.

State that should survive Genesis recreating the UI goes through `genesis.save({ app })` and comes back in `genesis.saved`, and the router saves its own state. See [navigation](navigation.md).

## Components, styles and assets

- Any component library that runs in a browser bundle works. Check that it renders well at phone width and respects the system color scheme, and follow [design](design.md) for the rest.
- Import CSS from the code, or use a CSS framework that runs at build time. In the source entry mode, imported CSS ends up in `foreground.css`.
- Ship fonts, icons and images inside the bundle so the applet does not depend on a third-party server. In Vite, files in `public/` are copied to the output directory and imported files are hashed into `assets/`.
- Keep the UI small. Every file is in the import file, and the first layout should not wait on large scripts.

## Vite and Vue

This applet watches the Hacker News front page and shows its stories in a Vue screen, with a button that loads the next page through the website's own "More" link.

```text
hn-vue/
  applet.json
  package.json
  vite.config.js
  index.html
  src/main.js
  src/App.vue
```

`applet.json` builds the UI with Vite and has no page module, because the JSON read specification below needs no code:

```json
{
  "schemaVersion": 6,
  "id": "hn-vue",
  "name": "HN Vue",
  "origins": ["https://news.ycombinator.com"],
  "foreground": { "kind": "web", "entry": "index.html" },
  "contexts": [{ "id": "primary", "startUrl": "https://news.ycombinator.com/" }],
  "capabilities": {},
  "build": { "foreground": { "command": "npx vite build", "dir": "web" } }
}
```

`package.json` keeps the `@genesis/sdk` and `@genesis/applet-tools` entries that `create` writes and adds Vue and Vite at exact versions:

```json
{
  "name": "hn-vue",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "check": "genesis-applet check .", "build": "genesis-applet build ." },
  "dependencies": { "@genesis/sdk": "0.0.0", "vue": "3.5.45" },
  "devDependencies": { "@genesis/applet-tools": "0.0.0", "@vitejs/plugin-vue": "6.0.11", "vite": "8.3.8" }
}
```

`vite.config.js` makes every URL relative and writes to `web/`:

```js
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  build: { outDir: "web", emptyOutDir: true },
});
```

`index.html` is Vite's entry. Vite rewrites the script path relative to `base` in the built file:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <title>HN Vue</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

`src/main.js` connects, starts the router and mounts the app, then reports the first layout:

```js
import { createApp } from "vue";
import { connect } from "@genesis/sdk";
import { createRouter } from "@genesis/sdk/router";
import App from "./App.vue";

async function start() {
  const genesis = await connect();
  const router = createRouter(genesis, {
    routes: [{ id: "home", pattern: "/", screen: "home", context: "primary" }],
  });
  createApp(App, { genesis, router }).mount("#app");
  genesis.ready();
}

void start();
```

`src/App.vue` renders the home screen when the router picks it. Any other URL shows the website itself:

```vue
<script setup>
import { onUnmounted, shallowRef } from "vue";
import { css } from "@genesis/sdk";

const props = defineProps({ genesis: Object, router: Object });
const primary = props.genesis.context("primary");

const stories = primary.watch("stories", {
  list: { css: "tr.athing" },
  key: { take: { attr: "id" } },
  fields: { title: { at: ".titleline > a", take: "text" } },
}, { when: [{ pattern: "/" }] });

const value = shallowRef(stories.get());
const screen = shallowRef(props.router.screen());
const offStories = stories.subscribe(() => { value.value = stories.get(); });
const offRouter = props.router.subscribe(() => { screen.value = props.router.screen(); });
const loading = shallowRef(false);

async function more() {
  loading.value = true;
  try {
    await primary.click(css("a.morelink"), { expect: { url: [{ pattern: "/", query: ["p"] }] } });
  } finally {
    loading.value = false;
  }
}

onUnmounted(() => {
  offStories();
  offRouter();
  stories.close();
});
</script>

<template>
  <main v-if="screen?.id === 'home'">
    <p v-if="value.status === 'loading'" role="status">Loading…</p>
    <p v-else-if="value.status === 'error'" role="alert">This page couldn't be read.</p>
    <ol v-else>
      <li v-for="key in value.order" :key="key">{{ value.records[key].title }}</li>
    </ol>
    <button type="button" :disabled="loading" @click="more">More</button>
  </main>
</template>
```

Build and install it:

```sh
npm install
npx genesis-applet build .
npx genesis-applet dev install . --device <serial>
```

To type check the Vue files, add `vue-tsc` to `devDependencies`, write the components in TypeScript and set `"check": "npx vue-tsc --noEmit"` in `build`. The watch, inputs and results that `App.vue` uses are described in [page control](page-control.md), and the full API is in the [SDK reference](sdk-reference.md).

## Debugging the UI

On a debuggable Genesis build, the UI WebView and the website WebViews appear in Chrome's remote inspector at `chrome://inspect`. Open the UI to read its console and inspect its layout, and open a website page to try locators against the live page.
