# Combine websites in one app

[Learning path](../README.md) · When one source is no longer enough

One applet can use several websites and show their records together. You do not need a separate app for each source.

## Example: a research reader

You browse two news websites. Each has its own source screen. A shared Saved page shows links you collected from either one.

Each saved item includes its source and original URL, so opening it returns to the right website.

## Try this request

> Read factory/AGENTS.md. Extend My reader with a second news website at [URL]. Keep one applet and the same ID. Preserve the existing source and records. Let me save links from either website into the same Saved page. Show each item's source. Open its original page and return to Saved with Back. If one source fails, keep the other source and existing records usable.

Replace `[URL]` with the actual site. Ask the agent to inspect both websites and explain any account or route restrictions.

## How the sources work together

Each source is its own running website document. App code can read permitted content in that document and store records for the shared app.

The shared page reads those records. It does not reach into every open website at once.

Visiting a page does not automatically import all of an account's history. Specify what to collect and when. Continuous background collection is not a current platform capability.

## Check the complete loop

Save one item from each source. Reopen Saved and check their titles, URLs, and source labels.

Open each item and return. Then check what the app shows when a source or service is unavailable.

Stored titles and excerpts are snapshots. They may become stale; the live source remains the place to check current content.

**Next:** [Add a backend only when needed](services.md).
