# Getting started

You need Node 24, the `@genesis/sdk` and `@genesis/applet-tools` packages, and for device installs a debug build of the Genesis app on a device or emulator reachable over adb.

## Create

Start from a template:

```sh
npx genesis-applet create my-applet --origin https://example.com --name "Example"
cd my-applet
npm install
```

`--template react` is the default. `--template vanilla` writes the same applet in TypeScript without a framework, through `connect` from `@genesis/sdk` and `createRouter` from `@genesis/sdk/router`. To use another framework, or a project you already have, add an `applet.json` whose `build` section names your build command and its output directory, as [frameworks](frameworks.md) describes.

Name the directory after the applet, with a short product name such as `hn-bookmarks` rather than the website's domain: one applet can span several websites. `create` derives the applet id from the directory name unless you pass `--id`. The id keys the applet's stored data and services, so keep the directory and the id the same, and never rename an existing id. In a collection of applets, the directory sits in the collection's root.

The scaffold contains:

| File | Purpose |
| --- | --- |
| `applet.json` | The manifest, schema 6: one context `primary` at the origin, the web UI, and a `build` section that names the UI entry and the page module |
| `src/page.ts` | The page module: one list reader `links` |
| `src/routes.ts` | The router's table: one route `home` at `/` to screen `home` |
| `src/main.tsx` (react) or `src/main.ts` (vanilla) | The UI: the router, the `home` screen with one watch, and one click |
| `src/theme.css` | Light and dark tokens, and the space for the menu button |
| `.specs/`, `.changelog/` | Applet records, already started; the current spec lists the compatibility values |
| `factory/` | This kit |
| `AGENTS.md`, `README.md` | Pointers to the kit and the records |

## The first watch

The page module runs inside every website page the applet opens. Its readers turn the page into JSON. The scaffold's reader lists the page's links, keyed by the URL and its occurrence, because a key must be unique in the list. A link's address can carry a session or form token in its query, and a reader never sends one out of the page, so the reader drops token-like query parameters and the fragment:

```ts
import { definePageModule, list } from "@genesis/sdk/page";

export interface Link {
  text: string;
  url: string;
}

/** Query parameters that often carry a session or form token. */
const SECRET = /auth|token|csrf|xsrf|sig|session|key|nonce/i;

/** The link's address without its fragment and without token-like query parameters. */
function linkUrl(link: Element): string {
  const url = new URL((link as HTMLAnchorElement).href);
  for (const name of [...url.searchParams.keys()]) if (SECRET.test(name)) url.searchParams.delete(name);
  url.hash = "";
  return url.href;
}

function linkKey(link: Element): string {
  const url = linkUrl(link);
  const same = [...link.ownerDocument.querySelectorAll("a[href]")].filter(other => linkUrl(other) === url);
  return `${url}#${same.indexOf(link)}`;
}

export default definePageModule({
  readers: {
    links: list<Link>({
      root: "body",
      items: "a[href]",
      key: linkKey,
      read: link => ({ text: link.textContent?.trim() ?? "", url: linkUrl(link) }),
      extent: link => [link.closest("li, p")],
    }),
  },
});
```

The UI watches the reader. A watch reads the page once, then sends only the records that change. Its `when` guards limit it to the pages its screen shows:

```tsx
import { useWatch } from "@genesis/sdk/react";
import type { Link } from "./page";

const HOME_PAGES = [{ pattern: "/" }];

function Home() {
  const links = useWatch<never, Link>("home:links", { reader: "links" }, { context: "primary", when: HOME_PAGES });
  if (links.status === "error") return <p role="alert">This page couldn't be read.</p>;
  if (links.status === "loading") return <p role="status">Loading…</p>;
  return <ul>{links.order.map(key => <li key={key}>{links.records[key].text}</li>)}</ul>;
}
```

[Page modules](page-modules.md) covers readers, keys and extents. [Page control](page-control.md) covers the read specifications a watch can take without a page module.

## The first input

An input acts on the website's own page. The scaffold clicks a link by its record, so the page agent finds the element again when the click runs:

```tsx
import { record } from "@genesis/sdk";
import { useGenesis, usePending } from "@genesis/sdk/react";

function LinkButton({ id, label }: { id: string; label: string }) {
  const genesis = useGenesis();
  const target = record("home:links", id);
  const pending = usePending(target, "primary").length > 0;
  const open = () => void genesis.context("primary").click(target, { navigates: true });
  return <button type="button" disabled={pending} onClick={open}>{label}</button>;
}
```

The click leaves the page, and the router decides what shows next: a URL with a route renders its screen, and any other URL shows the website itself. [Interactions](interactions.md) covers outcomes and commands, and [navigation](navigation.md) covers routes.

## Develop

1. Inspect the website and write the brief in `.specs/current.md` ([product scope](product-scope.md)).
2. Declare origins and contexts in `applet.json` ([SDK reference](sdk-reference.md)), and the routes and screens in `src/routes.ts` ([navigation](navigation.md)).
3. Write the page module's readers ([page modules](page-modules.md)) and the screens that watch them, with their loading, stale and error states ([patterns](patterns.md), [presentation](presentation.md)).
4. Add commands and inputs for what the user does on the website ([interactions](interactions.md)), and storage or a service for applet data ([services and data](services-and-data.md)).

Add the smallest set of dependencies and capabilities the requested features need. Do not reduce features to avoid a dependency.

## Check, build, install

```sh
npm run check                                      # compatibility, manifest, TypeScript and the page module
npm run build                                      # writes dist/ with the bundle
npx genesis-applet dev install . --device emulator-5554
npx genesis-applet dev status my-applet --device emulator-5554
```

`check` compares the applet with the tools and fails with `APPLET_INCOMPATIBLE` on a difference. It then validates the manifest against schema 6, type-checks the project (the `build.check` command, or `tsc` when there is a `tsconfig.json`), and bundles and imports the page module that `build.page` names. Importing runs the applet's code, so check only applets you trust. The page module must not import `@genesis/sdk/react`.

`build` bundles the UI and the page module into `dist/`. `--debug` sets the constant `__GENESIS_DEBUG__` to `true` instead of `false` in the code esbuild bundles (the page script, and the UI when `build.foreground` names an `entry`), so code guarded by `if (__GENESIS_DEBUG__)` stays in the build. A project's own UI build command does not see it. `dev install` takes the applet directory (it uses `dist/`) or a build output directory. It does not build, so run `build` first. It copies the bundle to the debug app, which applies it without restarting Genesis, and reports the accepted revision or the rejection reason, including an incompatible SDK. `dev status` lists the installed applets with their status and, given an id, its last install receipt. Every command accepts `--json`; device commands accept `--adb <path>` and `--application <id>`.

To sign in once on your laptop instead of on the phone, start Chrome with a separate profile and a DevTools port (`chrome --user-data-dir=<directory> --remote-debugging-port=9222`), sign in to the applet's websites there, and run `npx genesis-applet dev cookies . --device <serial>`. It copies only the cookies of the manifest's origins into a debug Genesis and reports counts per domain. Websites can treat imported cookies as a new sign-in and email the account about it, and Google sign-ins do not transfer. Partitioned cookies are not imported. Reload websites that were already open from the Genesis menu.

Release builds of Genesis refuse development installs. They install the applets bundled into the APK and published releases that people add from GitHub; see [publishing](publishing.md) for versions, tags and the CI workflows.

## Hand off the kit

`npx genesis-applet kit export --out <new-directory>` writes `AGENTS.md`, `README.md`, `guides/`, `skills/`, `templates/` and `kit.json` with the matching versions. Give a coding agent the path to `AGENTS.md`.
