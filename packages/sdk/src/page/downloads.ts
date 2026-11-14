import type { BridgeObject } from "../bridge.js";

/** The largest `blob:` download the agent hands to the shell. */
export const BLOB_DOWNLOAD_LIMIT = 128 * 1024 * 1024;

/** Base64 piece size when the WebView cannot post an `ArrayBuffer`; matches the shell's file chunks. */
const CHUNK_BYTES = 128 * 1024;

/** A download message starts with this text; the bridge client skips it without parsing. */
const BLOB_MESSAGE_PREFIX = '{"type":"genesis.blob';

/** How long a clicked `data:` link's `download` name still names the download that follows. */
const DATA_NAME_MS = 5000;

/**
 * Hands the website's own `blob:` downloads to the shell, which cannot read a page's blob URLs
 * itself. The shell asks with `{"type":"genesis.blob", token, url, buffers}` after it allowed the
 * download. The agent answers on the same bridge with a header `{"type":"genesis.blob", token,
 * mime, size, name?}` and then one `ArrayBuffer` message when `buffers`, or with `chunks` in the
 * header and `{"type":"genesis.blobChunk", token, seq, data}` messages of base64 text; a blob it
 * cannot read or that is over `BLOB_DOWNLOAD_LIMIT` gets `{"type":"genesis.blob", token, error}`.
 * For a `data:` download, which the shell reads itself, it asks with `nameOnly` and the agent
 * answers `{"type":"genesis.blob", token, name?}`. `name` is the `download` attribute of the link
 * the user clicked, since Android's download callback does not carry it.
 * Returns the bridge's `message` listener.
 */
export function createBlobSender(bridge: BridgeObject): (event: { data: unknown }) => void {
  const post = (message: object) => bridge.postMessage(JSON.stringify(message));
  const links = rememberDownloadLinks();
  return event => {
    if (typeof event.data !== "string" || !event.data.startsWith(BLOB_MESSAGE_PREFIX)) return;
    let message: any;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type !== "genesis.blob" || typeof message.token !== "number" || typeof message.url !== "string") return;
    const token: number = message.token;
    const url: string = message.url;
    if (message.nameOnly === true) {
      const name = links.nameFor(url);
      post(name ? { type: "genesis.blob", token, name } : { type: "genesis.blob", token });
      return;
    }
    if (!url.startsWith("blob:")) return;
    const name = links.nameFor(url);
    void (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        if (blob.size > BLOB_DOWNLOAD_LIMIT) {
          post({ type: "genesis.blob", token, error: "The file is too large" });
          return;
        }
        const bytes = await blob.arrayBuffer();
        const header = { type: "genesis.blob", token, mime: blob.type, size: blob.size, ...(name ? { name } : {}) };
        if (message.buffers === true) {
          post(header);
          bridge.postMessage(bytes);
          return;
        }
        const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
        post({ ...header, chunks });
        for (let seq = 0; seq < chunks; seq++) {
          const data = encode(new Uint8Array(bytes, seq * CHUNK_BYTES, Math.min(CHUNK_BYTES, bytes.byteLength - seq * CHUNK_BYTES)));
          post({ type: "genesis.blobChunk", token, seq, data });
        }
      } catch {
        post({ type: "genesis.blob", token, error: "The file could not be read" });
      }
    })();
  };
}

/**
 * Remembers the last clicked link with a `download` attribute and a `blob:` or `data:` address.
 * `nameFor(url)` is its name for the download of `url`: a blob URL must match exactly, and a
 * `data:` download (the shell sends only `data:`) must follow the click within `DATA_NAME_MS`.
 */
function rememberDownloadLinks(): { nameFor(url: string): string | null } {
  let last: { href: string; name: string; at: number } | null = null;
  window.addEventListener("click", event => {
    const target = event.target as Element | null;
    const link = target?.closest?.("a[download]") as HTMLAnchorElement | null;
    if (!link || !/^(blob|data):/i.test(link.href)) return;
    // Only the last path segment, as a browser saves it.
    const name = (link.getAttribute("download") ?? "").split(/[\\/]/).pop()!.trim();
    last = name ? { href: link.href, name, at: Date.now() } : null;
  }, true);
  return {
    nameFor(url) {
      if (!last) return null;
      if (url.startsWith("blob:")) return last.href === url ? last.name : null;
      return /^data:/i.test(last.href) && Date.now() - last.at < DATA_NAME_MS ? last.name : null;
    },
  };
}

function encode(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
