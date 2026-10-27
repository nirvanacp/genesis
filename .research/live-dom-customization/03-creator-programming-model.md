# Creator programming model

Date: 27 October 2026. Proposed SDK, not implemented. All `@genesis/*` packages and Genesis methods below are illustrative contracts. The examples have not been compiled or run. [Set overview](README.md).

## 1. What a creator writes

A creator writes a small web project. It can contain only CSS, a plain JavaScript customization, or a full component application mounted into selected parts of the page. React is supported through normal React DOM, not required by the core runtime.

```text
my-video-applet/
  genesis.json          # source matching, entry point and capabilities
  package.json
  package-lock.json
  src/
    main.tsx            # activation, effects and component mounting
    targets.ts          # reusable website selectors and guards
    Notes.tsx           # creator-owned UI and state
    page.css            # changes to the website
    notes.css           # styles inside the applet's UI container
  tests/
    watch-page.spec.ts
  fixtures/
    watch-page.html
```

The public runtime contract is framework-independent. A renderer adapter only needs to mount into an owned container and return a cleanup function. A creator can use normal HTML, SVG, canvas, browser events and compatible frontend dependencies. Node.js-only packages and server components do not become browser code automatically.

The user has explicitly approved this split: Rust for Genesis runtime behavior; JavaScript/TypeScript, React and CSS for creator code. Thin JS bindings and optional framework helpers are expected. Reimplementing React in Rust would defeat the stated authoring goal.

## 2. Start with the smallest useful customization

This fictional fixture contains `[data-zone="recommendations"]` and `[data-zone="watch-layout"]`. These are not YouTube selectors.

```css
/* page.css: the original player and its controls remain in place. */
[data-zone="recommendations"] {
  display: none !important;
}

[data-zone="watch-layout"] {
  max-width: 72rem;
  margin-inline: auto;
}
```

A CSS-only applet can package this file with a manifest. It does not need React, a record schema or a DOM mirror. Genesis should show which pages the rules apply to and let the creator disable the stylesheet.

Hiding content can change page behavior. In this example, validate that the recommendation region is not responsible for the required content-loading workflow. A managed stylesheet is easier to remove than a deleted subtree, but it is not automatically harmless.

## 3. Add a React feature beside the existing page

An illustrative manifest:

```json
{
  "schemaVersion": 1,
  "id": "local.video-notes",
  "name": "Video notes",
  "matches": ["https://video.example.test/watch/*"],
  "entry": "dist/applet.js",
  "capabilities": ["dom", "storage"],
  "dataSchemaVersion": 1
}
```

`matches` describes supported source routes. It does not establish that every matching page has the expected structure. Entry paths are package-relative. Package validation must check them before activation.

```tsx
// main.tsx: proposed Genesis SDK calls, ordinary React calls.
import { defineApplet } from '@genesis/sdk';
import { createRoot } from 'react-dom/client';
import { useSyncExternalStore } from 'react';
import pageCss from './page.css?inline';
import notesCss from './notes.css?inline';
import { Notes } from './Notes';

export default defineApplet({
  activate(ctx) {
    ctx.styles.add('page-layout', pageCss);

    const video = ctx.observe({
      selector: 'a[data-current-video]',
      cardinality: 'one',
      watch: { attributes: ['href'], text: true, childList: true },
      read(element) {
        const link = element as HTMLAnchorElement;
        return { key: link.href, title: link.textContent?.trim() ?? '' };
      }
    });

    function Panel() {
      const current = useSyncExternalStore(video.subscribe, video.getSnapshot);
      if (current.status !== 'ready') {
        return <p>Notes unavailable: {current.status}</p>;
      }
      return <Notes key={current.data.key}
                    video={current.data}
                    storage={ctx.storage} />;
    }

    ctx.ui.mount('notes-panel', {
      anchor: { selector: '[data-zone="watch-details"]', cardinality: 'one' },
      position: 'after',
      shadow: true,
      css: notesCss,
      render(container) {
        const root = createRoot(container);
        root.render(<Panel />);
        return () => root.unmount();
      }
    });
  }
});
```

The SDK tracks everything registered through `ctx`. When the route scope ends, it unmounts the panel and removes its styles and subscriptions. If the website replaces the anchor, the runtime disposes the old binding and mounts against a newly validated one. Rapid repeated removal becomes a conflict, not an endless remount loop.

The observation store returns immutable, cached snapshots. `getSnapshot` must return the same object while nothing changes. This is required for the React hook integration. Genesis-defined statuses include `missing`, `ambiguous`, `ready`, `stale` and `error`; the data is usable only in the documented states. [React external store contract](https://react.dev/reference/react/useSyncExternalStore).

An example notes component with its own state and persistent data:

```tsx
// Notes.tsx: proposed AppletStorage type, ordinary React component.
import { useEffect, useState } from 'react';
import type { AppletStorage } from '@genesis/sdk';

type Props = {
  video: { key: string; title: string };
  storage: AppletStorage;
};

export function Notes({ video, storage }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const key = `notes:${video.key}`;

  useEffect(() => {
    let active = true;
    storage.get<string>(key).then(value => {
      if (!active) return;
      setText(value ?? '');
      setStatus('ready');
    }).catch(() => {
      if (!active) return;
      setError('Could not load this note. Reopen the panel to retry.');
      setStatus('load-error');
    });
    return () => { active = false; };
  }, [key, storage]);

  async function save() {
    setStatus('saving');
    setError('');
    try {
      await storage.set(key, text);
      setStatus('saved');
    } catch {
      setError('Save failed. Your draft is still here.');
      setStatus('ready');
    }
  }

  const disabled = ['loading', 'load-error', 'saving'].includes(status);
  return <section aria-label="Personal notes">
    <h2>Notes for {video.title}</h2>
    <label>Note
      <textarea value={text} disabled={disabled}
                onChange={event => {
                  setText(event.target.value);
                  setStatus('ready');
                }} />
    </label>
    <button disabled={disabled} onClick={save}>Save locally</button>
    <p role="status">{error || status}</p>
  </section>;
}
```

The parent keys the component by content URL, so a different video starts a new component instance. Persistent writes go to the applet/profile namespace chosen by the host. The note is not stored in the website's database. Unsaved text in this minimal example is lost if the component unmounts; a production applet can add draft persistence or a navigation prompt.

The `?inline` imports above assume a configured Vite build. The actual package builder must emit assets that the qualified injection mechanism can load, rather than serving an arbitrary Vite HTML application inside the website. [Vite build documentation](https://vite.dev/guide/build.html).

## 4. Expose useful helpers without making them a ceiling

| Creator need | Proposed API family | Freedom retained |
| --- | --- | --- |
| Restyle or hide existing elements | `ctx.styles`, target-aware managed effects | Ordinary CSS selectors and declarations |
| Add a new feature | `ctx.ui.mount` | Any compatible component framework or plain DOM |
| Derive local state from the page | `ctx.observe` | Creator supplies selectors and extraction function |
| Add a whole custom region | Observation store plus owned UI | Creator chooses data shape, layout and interaction |
| Store independent data | `ctx.storage` | Creator-defined JSON data and schema |
| Use a personal service | Browser fetch or `ctx.http` | Creator endpoints and protocols within declared host capabilities |
| Interact with existing controls | Live elements or qualified source operations | No mandatory central catalog of website actions |
| Go beyond managed effects | `ctx.unmanaged` and direct DOM access | Ordinary scripting with explicit cleanup limits |

Observation callbacks run creator JS in the renderer. They are not translated into Rust. The Rust runtime schedules them and manages their lifetime; the creator remains responsible for their behavior. A slow or nonterminating callback cannot be made safe merely by giving it a typed signature.

Shared site packages can expose `watchPage.title`, `videoCards`, or an `open` helper. They should be normal editable modules with fixtures. A creator must be able to change a selector or read a new field without asking Genesis maintainers to change native code.

The core API should use stable handles and disposal functions. Optional React components such as `<Hide>` or `<Mount>` can register those effects through hooks. They must tolerate repeated setup/cleanup. No custom JSX compiler or `react-reconciler` dependency is necessary for that convenience layer.

## 5. Unrestricted DOM scripting

A deliberately simple escape-hatch example:

```ts
ctx.unmanaged('expand-shortcut', ({ document, signal }) => {
  document.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'e') {
      document.querySelector('[data-zone="watch-layout"]')
        ?.toggleAttribute('data-my-expanded');
    }
  }, { signal });

  return () => {
    document.querySelector('[data-zone="watch-layout"]')
      ?.removeAttribute('data-my-expanded');
  };
});
```

The runtime aborts the supplied signal and calls the cleanup function on scope disposal. This helps lifecycle management, but cannot find every timer, mutation or request a script creates. Arbitrary code can also bypass this wrapper and use standard DOM APIs. The interface must not advertise unmanaged code as fully tracked or automatically reversible.

Default creator execution should use an isolated world where supported. Access to page-global JavaScript objects requires a separate, explicitly qualified page-world integration. Direct DOM access does not imply access to private React state or every browser frame.

## 6. Independent data sources and reuse

Local notes, tags, personal queues and custom search state are ordinary applet features. A creator can also call their own server. The SDK should expose cancellation, status and errors without forcing a particular backend.

Host-brokered requests need an explicit contract for method, destination, body limit, timeout, redirects and credentials. They are separate from the website's browser requests. Remote writes need application-specific retry and idempotency rules; the SDK should not automatically retry an uncertain write.

A reusable applet package contains its source, pinned dependency graph, target definitions, assets, data schema and compatibility tests. Share modules through ordinary packages. A page redesign may require updating its target module; calling the project a reusable app does not eliminate that maintenance.

The API is successful if creators can implement an unanticipated feature without changing Genesis. The roadmap tests that directly with several creators, not merely with several layouts written by the runtime's author.
