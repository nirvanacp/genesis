import { GenesisError, type AppletStorage, type StoredDocument, type StorageCheck } from "@genesis/sdk";
import type { StorySnapshot } from "./extract-item";
import { discussionUrl, safeArticleUrl, validItemId } from "./item-url";
export interface BookmarkV1 extends StorySnapshot {
  schemaVersion: 1; savedAtMs: number; categoryIds: string[]; orderKey: string;
}
export interface OrderEntry { bookmarkKey: string }
export const bookmarkKey = (id: string) => `hn:item:${id}`;
const bytes = (value: string) => new TextEncoder().encode(value).length;
export const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const categoryId = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const orderKey = (time: number, id: string) => `${String(Number.MAX_SAFE_INTEGER - time).padStart(16, "0")}:${id}`;
export function validateBookmark(value: unknown): BookmarkV1 {
  const v = value as Partial<BookmarkV1> | null;
  if (!v || v.schemaVersion !== 1 || !validItemId(v.itemId) || v.discussionUrl !== discussionUrl(v.itemId)
    || typeof v.title !== "string" || !v.title.trim() || bytes(v.title) > 2048
    || !(v.submitter === null || typeof v.submitter === "string" && bytes(v.submitter) <= 256)
    || !(v.articleUrl === null || typeof v.articleUrl === "string" && safeArticleUrl(v.articleUrl) === v.articleUrl)
    || typeof v.truncated !== "boolean" || !timestamp(v.savedAtMs) || !timestamp(v.capturedAtMs)
    || !Array.isArray(v.categoryIds) || v.categoryIds.length > 50 || !v.categoryIds.every(categoryId)
    || new Set(v.categoryIds).size !== v.categoryIds.length || v.orderKey !== orderKey(v.savedAtMs, v.itemId)) {
    throw new GenesisError("STORAGE_FAILURE", "This saved story has an unsupported format. Its data has been preserved.");
  }
  return v as BookmarkV1;
}
export class BookmarkRepository {
  constructor(readonly storage: AppletStorage) {}
  async get(id: string): Promise<StoredDocument<BookmarkV1> | null> {
    if (!validItemId(id)) throw new GenesisError("INVALID_ARGUMENT", "Invalid story ID");
    const result = await this.storage.get("bookmarks", bookmarkKey(id));
    if (!result.document) return null;
    const value = validateBookmark(result.document.value);
    if (value.itemId !== id) throw new GenesisError("STORAGE_FAILURE", "Saved story identity mismatch. Data preserved.");
    return { ...result.document, value };
  }
  async save(snapshot: StorySnapshot, previous: StoredDocument<BookmarkV1> | null, options: {
    categoryIds?: string[]; checks?: StorageCheck[]; refresh?: boolean;
  } = {}): Promise<void> {
    const time = previous?.value.savedAtMs ?? Date.now();
    const key = bookmarkKey(snapshot.itemId);
    const value = validateBookmark({ ...(previous && !options.refresh ? previous.value : snapshot),
      schemaVersion: 1, savedAtMs: time, orderKey: orderKey(time, snapshot.itemId),
      categoryIds: options.categoryIds ?? previous?.value.categoryIds ?? [] });
    if (previous && previous.value.itemId !== snapshot.itemId) throw new GenesisError("INVALID_ARGUMENT", "Story identity changed");
    const checks: StorageCheck[] = [{ collection: "bookmarks", key, expectedRevision: previous?.revision ?? null }, ...(options.checks ?? [])];
    const puts: { collection: string; key: string; value: unknown }[] = [{ collection: "bookmarks", key, value }];
    if (!previous) {
      checks.push({ collection: "bookmark-order", key: value.orderKey, expectedRevision: null });
      puts.push({ collection: "bookmark-order", key: value.orderKey, value: { bookmarkKey: key } });
    }
    await this.storage.commit({ checks, puts, deletes: [] });
  }
  async remove(previous: StoredDocument<BookmarkV1>): Promise<void> {
    const value = validateBookmark(previous.value), key = bookmarkKey(value.itemId);
    const index = await this.storage.get<OrderEntry>("bookmark-order", value.orderKey);
    if (index.document && index.document.value.bookmarkKey !== key) throw new GenesisError("STORAGE_FAILURE", "Bookmark index mismatch. Data preserved.");
    await this.storage.commit({ checks: [
      { collection: "bookmarks", key, expectedRevision: previous.revision },
      { collection: "bookmark-order", key: value.orderKey, expectedRevision: index.document?.revision ?? null },
    ], puts: [], deletes: [{ collection: "bookmarks", key }, { collection: "bookmark-order", key: value.orderKey }] });
  }
}
