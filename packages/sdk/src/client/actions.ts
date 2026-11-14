import { USER_ACTION_DEADLINE_MS, type DownloadSave, type FileHandle, type FilesPick, type FilesPicked, type ShareInput } from "@genesis/core";
import type { Session } from "./session.js";

/** The page where the applet UI shows a picked file, for an `<img>` or `<video>` source. */
const PREVIEW_BASE = "https://appassets.androidplatform.net/genesis-files/";

/** A picked file with the URL the applet UI shows it at. */
export interface PickedFile extends FileHandle {
  /** Loads the file in the applet UI only, while it is held. */
  previewUrl: string;
}

/**
 * Picked files. They stay with Genesis: the applet holds ids, valid until released, until the
 * applet is retired or its window closes, or for 30 minutes. Never store an id.
 */
export interface Files {
  /** Opens Android's picker; resolves with no files when the user cancels. Needs a fresh tap. */
  pick(options?: FilesPick): Promise<PickedFile[]>;
  /** Lets go of picked files. */
  release(ids: ReadonlyArray<string>): Promise<void>;
}

export interface Downloads {
  /** Saves an https URL with the cookies of `context`, or a `data:` URL, to Downloads. Needs a fresh tap. */
  save(input: DownloadSave): Promise<void>;
}

export interface Links {
  /** Opens a mailto, tel, sms, smsto, geo, intent or https URL in another app. Needs a fresh tap. */
  openExternal(url: string): Promise<void>;
}

/**
 * Actions only the user may start. Each runs only within 3 seconds of a tap on the applet UI, so
 * call it straight from the tap's handler; otherwise it rejects with `USER_ACTION_REQUIRED`.
 */
interface UserActions {
  readonly files: Files;
  readonly downloads: Downloads;
  /** Opens Android's share sheet. Needs a fresh tap. */
  share(input: ShareInput): Promise<void>;
  readonly links: Links;
}

export function previewUrl(id: string): string {
  return PREVIEW_BASE + id;
}

export function createUserActions(session: Session): UserActions {
  // The user may stay in a picker or a prompt, so these wait as long as the host does.
  const act = <T>(method: Parameters<Session["request"]>[0], params: unknown) =>
    session.request<T>(method, params, { timeoutMs: USER_ACTION_DEADLINE_MS });
  return {
    files: {
      async pick(options = {}) {
        const { files } = await act<FilesPicked>("files.pick", { ...options });
        return files.map(file => ({ ...file, previewUrl: previewUrl(file.id) }));
      },
      async release(ids) {
        if (ids.length) await session.request("files.release", { ids: [...ids] });
      },
    },
    downloads: {
      async save(input) {
        await act("downloads.save", { ...input });
      },
    },
    async share(input) {
      await act("share.open", { ...input });
    },
    links: {
      async openExternal(url) {
        await act("links.openExternal", { url });
      },
    },
  };
}
