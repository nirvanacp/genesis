# Website features

Some website features need the user to see something: a file picker, a download, a share sheet, a fullscreen player, a sign-in window, a `confirm` question, a location prompt. A hidden page cannot show them. The applet still keeps these features in its own screens: the UI asks Genesis on the user's tap, and Genesis shows Android's picker, sheet or prompt over the applet while the website stays hidden.

Read this guide whenever a request or the website touches one of the features below. Do not send the user to the website for them. Only the features under [What stays on the website](#what-stays-on-the-website) show the website.

## Find them first

While you inspect the website ([product scope](product-scope.md#start-from-the-website)), list every place it offers one of these features: composers with photo, video or file attachments, images and videos, download and save buttons, share buttons, links that open another app, `confirm` questions before deleting or leaving, permission prompts and "Sign in with ..." buttons. Pick the handling for each from the table, and record it in the Website features table of `.specs/current.md`.

| Feature | In the applet | Needs |
| --- | --- | --- |
| [Post with photos or video](#post-with-photos-or-video) | The applet's composer with `useFilePicker`, then `attachFiles` on the site's file input | `limits.userActions` |
| [Attach a file to a message or profile](#attach-a-file-elsewhere) | `useFilePicker`, then `attachFiles` | `limits.userActions` |
| [Save an image or video](#save-an-image-or-video) | `genesis.downloads.save` with the media URL | `limits.userActions` |
| [Save a file the site makes](#save-a-file-the-site-makes) | `allow("download")`, then a trusted click on the site's button | `limits.grants`, `limits.trustedInput` |
| [Play a video fullscreen](#play-a-video-fullscreen) | `allow("fullscreen")`, then a trusted click on the site's player | `limits.grants`, `limits.trustedInput` |
| [Share](#share) | `genesis.share` with the page's canonical URL | `limits.userActions` |
| [Open in another app](#open-in-another-app) | `genesis.links.openExternal`, or `allow("handoff")` and a trusted click | `limits.userActions` or `limits.grants` |
| [Sign in with another provider](#sign-in-with-another-provider) | `allow("window")`, then a trusted click on the provider button | `limits.grants`, `limits.trustedInput` |
| [Website dialogs](#website-dialogs) | `useDialog` with `WebsiteDialog` or the applet's own sheet | `limits.dialogs` |
| [Location](#location) | `allow("location")`, then a trusted click on the site's control | `limits.grants`, `limits.trustedInput` |
| [Notifications](#notifications) | `genesis.notifications.enable` from a switch | `capabilities.notifications` |

## One tap, one user action

Picking files, saving, sharing, opening another app, turning notifications on and `context.allow` are user actions ([requirement-user-tap-actions](rules.md#user-tap-actions)):

- Call one straight from the handler of a tap on the applet UI, before any other `await`. It runs only within 3 seconds of the tap, and once per tap.
- One tap starts one user action. Never chain two, and never start one from a timer, a watch, a page event or after a slow request.
- A tap on the website and trusted input do not count as a tap on the applet UI.
- Without a fresh tap it rejects with `GenesisError` code `USER_ACTION_REQUIRED`. Ask the user to tap again; never call it again yourself.

Every recipe below handles that error with the same helper:

```ts
import { GenesisError } from "@genesis/sdk";

/** The message for a failed user action: a tap that came too late asks for another tap. */
export function actionMessage(error: unknown, fallback: string): string {
  if (error instanceof GenesisError && error.code === "USER_ACTION_REQUIRED") return "Tap again to continue.";
  return fallback;
}
```

Picked files, inputs and grants also need the feature flag of the running Genesis. Check it before rendering the control, and fall back as [Limits and fallbacks](#limits-and-fallbacks) describes.

## Post with photos or video

Rebuild the site's composer as an applet screen. The user writes and picks files in the applet; on Post, the applet hands both to the site's own composer in the hidden context and clicks its Post button.

Give the site's composer URL a route whose screen is the applet's composer. Opening it loads the site's composer in the context while the applet shows its own screen:

```ts
{ id: "compose", pattern: "/compose/post", screen: "compose", requiresAccount: true, ready: { reader: "composer.ready" } },
```

When the site's composer has no URL of its own, such as a dialog on the feed, open the applet's composer as an overlay screen instead, and on Post click the site's Compose button first. An overlay screen keeps the website covered while the page changes under it.

```tsx
import { css, type ActionResult } from "@genesis/sdk";
import { useFilePicker, useGenesis } from "@genesis/sdk/react";
import { useState } from "react";
import { actionMessage } from "../actions";

const MAX_FILES = 4; // the site's own limit
const EDITOR = css("[data-testid=composer] textarea");
const FILE_INPUT = css("[data-testid=composer] input[type=file]");
const POST = css("[data-testid=composer] button[type=submit]");

type Status = "idle" | "posting" | "failed" | "unknown";

export function ComposeScreen() {
  const site = useGenesis().context("primary");
  const { files, pick, remove, clear } = useFilePicker();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function addFiles() {
    const room = MAX_FILES - files.length;
    try {
      const picked = await pick({ accept: ["image/*", "video/*"], multiple: true });
      for (const extra of picked.slice(room)) remove(extra.id);
      setMessage(picked.length > room ? `You can add ${MAX_FILES} photos or videos.` : null);
    } catch (error) {
      setMessage(actionMessage(error, "Couldn't open your photos."));
    }
  }

  function settle(result: ActionResult) {
    setStatus(result.outcome === "unknown" ? "unknown" : "failed");
    if (result.code === "RATE_LIMITED") setMessage("Too many actions at once. Tap Post again.");
    else if (result.code === "FILE_UNAVAILABLE") setMessage("A photo is no longer available. Remove it and add it again.");
    else if (result.outcome === "unknown") setMessage("The website didn't confirm the post. Check your profile before posting again.");
    else setMessage("Couldn't post. Your text and photos are still here.");
  }

  async function post() {
    setStatus("posting");
    setMessage(null);
    const wrote = await site.fill(EDITOR, text, { timeoutMs: 5_000, until: { read: { reader: "composer.text", args: { text } } } });
    if (wrote.outcome !== "observed") return settle(wrote);
    if (files.length) {
      const attached = await site.attachFiles(FILE_INPUT, files, { until: { read: { reader: "composer.uploaded", args: { count: files.length } } } });
      if (attached.outcome !== "observed") return settle(attached);
    }
    const posted = await site.click(POST, { timeoutMs: 15_000, navigates: true, expect: { url: [{ pattern: "/home" }] } });
    if (posted.outcome !== "observed") return settle(posted);
    clear();
    setText("");
    setStatus("idle");
  }

  const busy = status === "posting";
  return <form className="composer" onSubmit={event => { event.preventDefault(); void post(); }}>
    <textarea value={text} onChange={event => setText(event.target.value)} disabled={busy} aria-label="Post text" />
    <ul className="attachments">
      {files.map(file => <li key={file.id}>
        {file.type.startsWith("video/")
          ? <video src={file.previewUrl} muted playsInline aria-label={file.name} />
          : <img src={file.previewUrl} alt={file.name} />}
        <button type="button" onClick={() => remove(file.id)} disabled={busy} aria-label={`Remove ${file.name}`}>×</button>
      </li>)}
    </ul>
    <p className="hint">{files.length} of {MAX_FILES}</p>
    <button type="button" onClick={() => void addFiles()} disabled={busy || files.length >= MAX_FILES}>Add photos</button>
    <button type="submit" disabled={busy || (!text.trim() && !files.length)}>{busy ? "Posting…" : "Post"}</button>
    {message && <p role="alert">{message}</p>}
  </form>;
}
```

- `pick` is the user action, so it is the first `await` of the Add photos tap. With `multiple`, `useFilePicker` adds to the files it holds; without it, a pick replaces them. It releases the files when the screen unmounts.
- Show every file with its `previewUrl`, a remove button, the count and the site's limit ([default-attachment-preview](defaults.md)). A preview loads only in the applet UI.
- Post is one tap that runs one sequence: write the text, attach the files, click Post. `fill`, `attachFiles` and `click` are page inputs, not user actions, so they may follow each other after awaits.
- `fill` works on a plain `<textarea>`. A rich editor that ignores it answers `editor-needs-trusted-input`; use `type(EDITOR, text, { input: "trusted" })` there, up to 2000 characters.
- Find the file input with a page module reader when the site builds it late or hides it in a menu. `attachFiles` takes a hidden input; it fails with `not-a-file-input` or `type-not-accepted` as [page control](page-control.md#attaching-files) describes.
- Wait for the site's own evidence. Here `composer.text` and `composer.uploaded` are page module `value` readers: the editor holds the text, and the site shows a finished thumbnail for each file. A site that uploads while you wait may keep Post disabled; the click's `timeoutMs` waits for it, up to 15 seconds.
- Show `posting` while the inputs run. Keep the text and files after `failed` and `unknown`, and never post again on your own: an `unknown` post may have gone through. Read the site's error text with a reader and show it when it has one.

To check the composer without posting, attach a file, confirm the site's thumbnail appears, then discard the draft on the site ([verification](verification.md#device-walkthrough)).

## Attach a file elsewhere

A profile photo, a file in a message or a document upload uses the same two steps with one file:

```tsx
const { files, pick, clear } = useFilePicker();
// The Choose photo tap:
await pick({ accept: ["image/jpeg", "image/png"] });
// The Save tap:
const result = await site.attachFiles(css("input[type=file][name=avatar]"), files, { until: { target: css(".avatar-preview"), state: "visible" } });
if (result.outcome === "observed") clear();
```

Use `via: "drop"` for a drop zone and `via: "paste"` for an editor that takes pasted images.

## Save an image or video

When the reader has the file's `https` URL, save it straight from the applet. The download carries the context's cookies, so signed-in media works:

```tsx
import { useGenesis } from "@genesis/sdk/react";
import { useState } from "react";
import { actionMessage } from "../actions";

export function SaveButton({ url, filename }: { url: string; filename?: string }) {
  const genesis = useGenesis();
  const [message, setMessage] = useState<string | null>(null);
  return <>
    <button type="button" onClick={async () => {
      setMessage(null);
      try {
        await genesis.downloads.save({ context: "primary", url, filename });
        setMessage("Saving to Downloads");
      } catch (error) {
        setMessage(actionMessage(error, "Couldn't save this file."));
      }
    }}>Save</button>
    {message && <p role="status">{message}</p>}
  </>;
}
```

Read the URL with `field.url` in the reader. Pick the largest version the page offers, not a thumbnail. A `data:` URL up to 2 MiB also works. The promise resolves once the download started; Android shows its progress.

### Save a file the site makes

Some files exist only after the site builds them, such as an export or a `blob:` video. Let the hidden page download once, then press the site's button:

```tsx
<button type="button" onClick={async () => {
  try {
    await site.allow("download");
    const result = await site.click(css("button.export"), { input: "trusted" });
    if (result.outcome === "failed") setMessage("Couldn't start the download.");
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't start the download."));
  }
}}>Export</button>
```

The file goes to Downloads. A `blob:` file is saved only on the manifest's origins.

## Play a video fullscreen

Let the site's own player go fullscreen. The video shows over the applet while the context stays hidden; Back or the player's exit returns to the applet:

```tsx
<button type="button" onClick={async () => {
  try {
    await site.allow("fullscreen");
    await site.click(css("video + .controls .fullscreen"), { input: "trusted" });
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't play full screen."));
  }
}}>Full screen</button>
```

When the reader has a plain `https` file URL that loads without sign-in, the applet can also play the video inline with `<video src={url} controls playsInline>`. Streams that the site assembles in the page (`blob:` sources) play only in the site's player.

## Share

Share the page's canonical address, not the applet's:

```tsx
<button type="button" onClick={async () => {
  try {
    await genesis.share({ title: post.title, url: post.url });
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't share."));
  }
}}>Share</button>
```

Read `post.url` from the page. `share` needs at least one of `title`, `text` and `url`, and resolves when the share sheet showed, not when the user shared. The site's own Share button cannot share from a hidden page, so the applet's control calls `genesis.share`.

## Open in another app

`genesis.links.openExternal(url)` opens a `mailto`, `tel`, `sms`, `smsto`, `geo`, `intent` or `https` link in another app. An `https` link opens only in an app that claims it, never in a browser; otherwise it rejects with `NOT_FOUND`. Then open the link in the context instead:

```tsx
<button type="button" onClick={async () => {
  try {
    await genesis.links.openExternal(link);
  } catch (error) {
    if (error instanceof GenesisError && error.code === "NOT_FOUND" && link.startsWith("https:")) navigate({ url: link });
    else setMessage(actionMessage(error, "No app can open this link."));
  }
}}>Open in app</button>
```

When the site builds the app link in a script, let the hidden page hand it over once with `allow("handoff")`, then a trusted click on the site's link.

## Sign in with another provider

Sign-in normally shows the website, where "Sign in with ..." buttons work as in a browser. When an applet screen offers the site's provider button itself, let the hidden page open one window:

```tsx
<button type="button" onClick={async () => {
  try {
    await site.allow("window");
    await site.click(css("button.sign-in-provider"), { input: "trusted" });
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't open the sign-in window."));
  }
}}>Continue with Provider</button>
```

The window opens in a sheet over the applet, under the website bar; the user signs in there, and closing it returns to the applet. The applet never types into it. Google refuses some sign-ins inside an embedded browser; when that happens, offer the site's own sign-in on the website.

## Website dialogs

A site asks with `confirm`, `alert`, `prompt` or a leave question, often before it deletes or discards something. The hidden page waits for the answer. Render `useDialog()` on every screen whose actions can raise one ([requirement-website-dialogs](rules.md#website-dialogs)):

```tsx
import { useDialog, WebsiteDialog } from "@genesis/sdk/react";

export function PostScreen() {
  const dialog = useDialog();
  return <>
    {/* the screen's content and its Delete control */}
    <WebsiteDialog dialog={dialog} className="sheet" />
  </>;
}
```

`WebsiteDialog` shows the site's origin, its exact message, a field for a prompt, Cancel and OK. Style it, or build the applet's own sheet from the `Dialog` with `dialog.answer(accept, value?)`. Answer only with the user's choice. A dialog no screen claims within about a second shows on the revealed website instead.

## Location

When the site has a "Use my location" control, let the hidden page ask once:

```tsx
<button type="button" onClick={async () => {
  try {
    await site.allow("location");
    await site.click(css("button.locate"), { input: "trusted" });
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't ask for your location."));
  }
}}>Use my location</button>
```

The prompt shows over the applet. The site gets the location only after the user allows it in Genesis and in Android.

## Notifications

A switch in the applet's settings turns the applet's notifications on, asking Android when needed. It needs `capabilities.notifications` in the manifest:

```tsx
<button type="button" onClick={async () => {
  try {
    setEnabled(await genesis.notifications.enable());
  } catch (error) {
    setMessage(actionMessage(error, "Couldn't turn notifications on."));
  }
}}>Turn on notifications</button>
```

`enable` resolves with `false` when the user or Android refused. See [Notifications](sdk-reference.md#notifications) for posting them.

## What stays on the website

These show the website, from an explicit control with the [website cue](defaults.md), such as "Record in *website*", that calls `viewWebsite()` from `useRouter`:

- Camera and microphone. The page that uses them must stay revealed: covering it reloads the page and stops them.
- Passwords, one-time codes and card fields. The applet never reads or types them ([protected fields](rules.md#protected-fields)).
- Payments and CAPTCHAs or other challenges.
- Content in cross-origin frames, which the page agent cannot read or target.
- Server sign-in prompts and client certificates.

Name the website in the control so the user knows what will show.

## Limits and fallbacks

| Situation | Show |
| --- | --- |
| `USER_ACTION_REQUIRED` | "Tap again to continue." Never call the action again yourself. |
| `RATE_LIMITED` on an input | A failure; nothing reached the page. Let the user tap again. Never retry on a timer. |
| `FILE_UNAVAILABLE` | The file expired or was released. Ask the user to remove it and pick it again. |
| `NOT_FOUND` from `openExternal` | No app takes the link. Open an `https` link in the context. |
| `CONFIGURATION_REQUIRED` from `notifications.enable` | The manifest lacks `capabilities.notifications`. Fix the manifest. |
| `failed` with `NOT_ACTIONABLE` on `attachFiles` | The target is not a file input, or the site does not accept the file's type. |
| `unknown` after Post | Keep the draft and say the website did not confirm. Never post again on your own. |

- A pick returns up to 16 files of at most 64 MiB each; one `attachFiles` takes at most 128 MiB. File ids last until released, until the applet closes, or 30 minutes. Never store them.
- A grant lasts 5 seconds and is used once. A navigation, a reveal, a cover or a window ends it.
- Each context takes 20 inputs at once, then one more per second. One tap runs one sequence, so a normal composer never reaches it.

Read the flags from `genesis.limits` before showing a control. Each is absent in an older Genesis:

| Flag | Without it |
| --- | --- |
| `userActions` | Picking, saving, sharing and opening apps reject with `UNKNOWN_METHOD`, and `attachFiles` fails with `INPUT_UNAVAILABLE`. |
| `grants` | `allow` rejects with `UNKNOWN_METHOD`. |
| `trustedInput` | Trusted clicks fail with `INPUT_UNAVAILABLE`, so a grant has nothing to use it. |
| `dialogs` | Dialogs show on the revealed website. |

When a flag is missing, keep the control and make it show the website with the website cue, such as "Post in *website*", through `viewWebsite()`. The user then does the same thing on the site.

```tsx
const { limits } = useGenesis();
const { viewWebsite } = useRouter();
const canAttach = limits.userActions === true;
return canAttach
  ? <button type="button" onClick={() => void addFiles()}>Add photos</button>
  : <button type="button" onClick={() => viewWebsite()}>Add photos in website <WebsiteCue /></button>;
```
