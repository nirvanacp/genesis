import { GenesisError, type AppletStorage, type StoredDocument } from "@genesis/sdk";
import { activeMembership, type CategorySnapshot } from "./categories";
import { bookmarkKey, validateBookmark, type BookmarkV1, type OrderEntry } from "./repository";
import { readInBatches } from "./storage-utils";
export type LibraryFilter = "all" | "uncategorized" | string;
export interface BookmarkPage {
  entries: StoredDocument<BookmarkV1>[]; cursor: string | undefined; done: boolean; scanned: number; missing: number;
}
const changed = () => new GenesisError("CONFLICT", "The library changed during this read. Reload to continue.");
const aborted = (signal: AbortSignal) => { if (signal.aborted) throw new DOMException("Scan canceled", "AbortError"); };
export async function readBookmarkPage(storage: AppletStorage, categories: CategorySnapshot, filter: LibraryFilter,
  afterKey: string | undefined, signal: AbortSignal, progress: (scanned: number) => void): Promise<BookmarkPage> {
  const entries: StoredDocument<BookmarkV1>[] = [];
  let cursor = afterKey, done = false, scanned = 0, missing = 0;
  while (entries.length < 20 && !done) {
    aborted(signal);
    const page = await storage.list<OrderEntry>("bookmark-order", { ...(cursor ? { afterKey: cursor } : {}), limit: 100 });
    if (page.namespaceRevision !== categories.namespaceRevision) throw changed();
    if (page.entries.length === 0) { done = true; break; }
    for (let offset = 0; offset < page.entries.length && entries.length < 20; offset += 8) {
      aborted(signal);
      const indexes = page.entries.slice(offset, offset + 8);
      const records = await readInBatches(indexes, index => {
        if (typeof index.value?.bookmarkKey !== "string" || !/^hn:item:[1-9][0-9]*$/.test(index.value.bookmarkKey)) {
          throw new GenesisError("STORAGE_FAILURE", "A bookmark order entry is invalid. Its data has been preserved.");
        }
        return storage.get("bookmarks", index.value.bookmarkKey);
      });
      aborted(signal);
      if (records.some(result => result.namespaceRevision !== categories.namespaceRevision)) throw changed();
      for (let position = 0; position < indexes.length && entries.length < 20; position++) {
        const index = indexes[position]!, document = records[position]!.document;
        cursor = index.key; scanned++;
        if (!document) { missing++; }
        else {
          const value = validateBookmark(document.value);
          if (index.key !== value.orderKey || document.key !== bookmarkKey(value.itemId) || index.value.bookmarkKey !== document.key) {
            throw new GenesisError("STORAGE_FAILURE", "A bookmark order entry does not match its story. Data preserved.");
          }
          const memberships = activeMembership(value.categoryIds, categories);
          if (filter === "all" || filter === "uncategorized" && memberships.length === 0 || memberships.includes(filter)) entries.push({ ...document, value });
        }
        done = offset + position === page.entries.length - 1 && page.nextAfterKey === null;
      }
      progress(scanned);
    }
  }
  aborted(signal);
  return { entries, cursor, done, scanned, missing };
}
