import type { BridgeObject } from "../bridge.js";

/** The largest `blob:` download the agent hands to the shell. */
export const BLOB_DOWNLOAD_LIMIT = 128 * 1024 * 1024;

/** Base64 piece size when the WebView cannot post an `ArrayBuffer`; matches the shell's file chunks. */
const CHUNK_BYTES = 128 * 1024;

/** A download message starts with this text; the bridge client skips it without parsing. */
const BLOB_MESSAGE_PREFIX = '{"type":"genesis.blob';

/**
 * Hands the website's own `blob:` downloads to the shell, which cannot read a page's blob URLs
 * itself. The shell asks with `{"type":"genesis.blob", token, url, buffers}` after it allowed the
 * download. The agent answers on the same bridge with a header `{"type":"genesis.blob", token,
 * mime, size}` and then one `ArrayBuffer` message when `buffers`, or with `chunks` in the header
 * and `{"type":"genesis.blobChunk", token, seq, data}` messages of base64 text; a blob it cannot
 * read or that is over `BLOB_DOWNLOAD_LIMIT` gets `{"type":"genesis.blob", token, error}`.
 * Returns the bridge's `message` listener.
 */
export function createBlobSender(bridge: BridgeObject): (event: { data: unknown }) => void {
  const post = (message: object) => bridge.postMessage(JSON.stringify(message));
  return event => {
    if (typeof event.data !== "string" || !event.data.startsWith(BLOB_MESSAGE_PREFIX)) return;
    let message: any;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message?.type !== "genesis.blob" || typeof message.token !== "number" || typeof message.url !== "string") return;
    const token: number = message.token;
    const url: string = message.url;
    if (!url.startsWith("blob:")) return;
    void (async () => {
      try {
        const blob = await (await fetch(url)).blob();
        if (blob.size > BLOB_DOWNLOAD_LIMIT) {
          post({ type: "genesis.blob", token, error: "The file is too large" });
          return;
        }
        const bytes = await blob.arrayBuffer();
        const header = { type: "genesis.blob", token, mime: blob.type, size: blob.size };
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

function encode(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
