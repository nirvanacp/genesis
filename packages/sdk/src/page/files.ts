import { PageError } from "./errors.js";

/**
 * Receives picked files the shell posts to this page for `attachFiles`. The bytes come straight
 * from the shell through the page's bridge, never through the host: per file, a header
 * `{"type":"genesis.file", token, index, name, mime, size, chunks?}` and then either one
 * `ArrayBuffer` message or `chunks` messages `{"type":"genesis.fileChunk", token, index, seq, data}`
 * of base64 text; the transfer ends with `{"type":"genesis.filesEnd", token}`. The shell answers
 * `page.files` only after the end message, so the finished transfer is here when it resolves.
 */
export interface FileReceiver {
  /** The bridge's `message` listener. */
  handle(event: { data: unknown }): void;
  /** The files of the last finished transfer, once; `FILE_UNAVAILABLE` unless there are `count` of them. */
  take(count: number): File[];
}

/** A transfer message starts with this text, so other listeners can skip it without parsing. */
export const FILE_MESSAGE_PREFIX = '{"type":"genesis.file';

interface Header {
  token: number;
  index: number;
  name: string;
  mime: string;
  size: number;
  chunks?: number;
}

export function createFileReceiver(): FileReceiver {
  let token: number | null = null;
  let files: File[] = [];
  let header: Header | null = null;
  let chunks: string[] = [];
  let finished: File[] | null = null;

  const add = (parts: BlobPart[]) => {
    if (!header) return;
    files[header.index] = new File(parts, header.name, { type: header.mime });
    header = null;
    chunks = [];
  };

  return {
    handle(event) {
      const data = event.data;
      if (data instanceof ArrayBuffer) {
        if (header && header.chunks === undefined) add([data]);
        return;
      }
      if (typeof data !== "string" || !data.startsWith(FILE_MESSAGE_PREFIX)) return;
      let message: any;
      try { message = JSON.parse(data); } catch { return; }
      if (typeof message?.token !== "number") return;
      if (message.token !== token) {
        token = message.token;
        files = [];
        header = null;
        chunks = [];
      }
      switch (message.type) {
        case "genesis.file":
          header = message as Header;
          if (header.chunks === 0) add([]);
          break;
        case "genesis.fileChunk":
          if (!header || message.index !== header.index || typeof message.data !== "string") return;
          chunks[message.seq] = message.data;
          if (chunks.filter(chunk => chunk !== undefined).length === header.chunks) add(chunks.map(decode));
          break;
        case "genesis.filesEnd":
          finished = files;
          token = null;
          files = [];
          break;
      }
    },
    take(count) {
      const done = finished;
      finished = null;
      if (!done || done.length !== count || done.some(file => file === undefined)) {
        throw new PageError("FILE_UNAVAILABLE", "The picked files did not reach the page");
      }
      return done;
    },
  };
}

function decode(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
