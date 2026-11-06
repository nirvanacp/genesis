/**
 * Saved stories and their categories, stored in the applet's bookmarks service.
 * The record shapes and invariants are unchanged from the first release, so existing data reads as is.
 */
import { useEffect, useMemo, useState } from "react";
import { GenesisError, serviceMessage, type Storage, type StorageBatch, type StorageChange, type StoredDocument } from "@genesis/sdk";
import { useAppResume, useForeground, useRecords, type Foreground } from "@genesis/sdk/react";
import { itemUrl, safeUrl, validItemId, type Story } from "./model";

type Check = NonNullable<StorageBatch["checks"]>[number];

/** The story fields a bookmark keeps, as the first release stored them. */
export interface StorySnapshot {
  itemId: string; discussionUrl: string; articleUrl: string | null;
  title: string; submitter: string | null; truncated: boolean; capturedAtMs: number;
}
export interface BookmarkV1 extends StorySnapshot {
  schemaVersion: 1; savedAtMs: number; categoryIds: string[]; orderKey: string;
}
export interface CategoryV1 {
  schemaVersion: 1; id: string; name: string; normalizedName: string;
  createdAtMs: number; deletedAtMs: number | null;
}
interface CategoryMeta { ids: string[] }
interface NameEntry { categoryId: string }
interface OrderEntry { bookmarkKey: string }
export interface CategorySnapshot {
  meta: StoredDocument<CategoryMeta> | null;
  categories: StoredDocument<CategoryV1>[];
  namespaceRevision: number;
}

// ---- Service storage ------------------------------------------------------------------------

const BACKEND_CODES = new Set(["CONFLICT", "INVALID_ARGUMENT", "NOT_FOUND", "QUOTA_EXCEEDED", "STORAGE_FAILURE"]);
const stores = new WeakMap<Foreground, Storage & { refresh(): void }>();

/** `Storage` over the service's `/v1/documents` protocol; one instance per foreground. */
export function serviceStorage(foreground: Foreground): Storage & { refresh(): void } {
  const existing = stores.get(foreground);
  if (existing) return existing;
  const listeners = new Set<(change: StorageChange) => void>();
  const notify = (change: StorageChange) => queueMicrotask(() => {
    for (const listener of listeners) {
      try { listener(change); } catch (error) { console.error("Library change listener failed", error); }
    }
  });
  async function call<T extends { namespaceRevision: number }>(operation: string, params: unknown): Promise<T> {
    const response = await foreground.services.request<{
      result?: T; changes?: StorageChange["changes"]; error?: { code: string; message: string };
    }>("bookmarks", "/v1/documents", { method: "POST", body: { operation, params } });
    const failure = response.body?.error;
    if (response.status < 200 || response.status >= 300 || failure) {
      const code = failure && BACKEND_CODES.has(failure.code) ? failure.code as "CONFLICT" : "SERVICE_FAILURE";
      throw new GenesisError(code, failure?.message ?? "The bookmarks service refused the request. Reload before retrying.");
    }
    const result = response.body?.result;
    if (!result || typeof result !== "object") throw new GenesisError("SERVICE_FAILURE", "The bookmarks service sent an invalid answer.");
    if (operation === "commit") notify({ changes: response.body.changes ?? [], namespaceRevision: result.namespaceRevision });
    return result;
  }
  const storage = {
    get: (collection: string, key: string) => call("get", { collection, key }),
    list: (collection: string, options: { afterKey?: string; limit?: number } = {}) =>
      call("list", { collection, limit: 100, ...options }),
    commit: (batch: StorageBatch) => call("commit", { checks: [], puts: [], deletes: [], ...batch }),
    onChanged(listener: (change: StorageChange) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** Tells every reader to reread, after the applet returns from elsewhere. */
    refresh: () => notify({ changes: ["bookmarks", "categories", "category-meta"].map(collection => ({ collection, key: "" })), namespaceRevision: 0 }),
  } as Storage & { refresh(): void };
  foreground.onRetired(() => listeners.clear());
  stores.set(foreground, storage);
  return storage;
}

// ---- Validation -----------------------------------------------------------------------------

const byteLength = (value: string) => new TextEncoder().encode(value).length;
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const categoryId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const bookmarkKey = (id: string) => `hn:item:${id}`;
const orderKey = (time: number, id: string) => `${String(Number.MAX_SAFE_INTEGER - time).padStart(16, "0")}:${id}`;
const invalidCategories = () => new GenesisError("STORAGE_FAILURE", "Category data has an unsupported format. Its data has been preserved.");
const categoriesChanged = () => new GenesisError("CONFLICT", "Categories changed. Review them before retrying.");
const sameName = () => new GenesisError("CONFLICT", "A category with this name already exists.");

export function validateBookmark(value: unknown): BookmarkV1 {
  const v = value as Partial<BookmarkV1> | null;
  if (!v || v.schemaVersion !== 1 || !validItemId(v.itemId) || v.discussionUrl !== itemUrl(v.itemId)
    || typeof v.title !== "string" || !v.title.trim() || byteLength(v.title) > 2048
    || !(v.submitter === null || typeof v.submitter === "string" && byteLength(v.submitter) <= 256)
    || !(v.articleUrl === null || typeof v.articleUrl === "string" && safeUrl(v.articleUrl) === v.articleUrl)
    || typeof v.truncated !== "boolean" || !timestamp(v.savedAtMs) || !timestamp(v.capturedAtMs)
    || !Array.isArray(v.categoryIds) || v.categoryIds.length > 50 || !v.categoryIds.every(categoryId)
    || new Set(v.categoryIds).size !== v.categoryIds.length || v.orderKey !== orderKey(v.savedAtMs, v.itemId)) {
    throw new GenesisError("STORAGE_FAILURE", "This saved story has an unsupported format. Its data has been preserved.");
  }
  return v as BookmarkV1;
}

/** Trims the display name and derives the comparison form: NFKC, collapsed spaces, lowercase. */
export function categoryName(raw: string): { name: string; normalizedName: string } {
  const name = raw.trim();
  const normalizedName = name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (!name || [...name].length > 40 || !normalizedName || byteLength(normalizedName) > 512) {
    throw new GenesisError("INVALID_ARGUMENT", "Use a category name of 1 to 40 characters.");
  }
  if (["all", "uncategorized"].includes(normalizedName)) {
    throw new GenesisError("INVALID_ARGUMENT", "All and Uncategorized are reserved filter names.");
  }
  return { name, normalizedName };
}

function validateCategory(value: unknown): CategoryV1 {
  const v = value as Partial<CategoryV1> | null;
  try {
    if (!v || v.schemaVersion !== 1 || !categoryId(v.id) || typeof v.name !== "string" || !timestamp(v.createdAtMs)
      || !(v.deletedAtMs === null || timestamp(v.deletedAtMs) && v.deletedAtMs >= v.createdAtMs)) throw invalidCategories();
    const name = categoryName(v.name);
    if (v.name !== name.name || v.normalizedName !== name.normalizedName) throw invalidCategories();
    return v as CategoryV1;
  } catch { throw invalidCategories(); }
}

function validateMeta(value: unknown): CategoryMeta {
  const v = value as Partial<CategoryMeta> | null;
  if (!v || !Array.isArray(v.ids) || v.ids.length > 50 || !v.ids.every(categoryId) || new Set(v.ids).size !== v.ids.length) {
    throw invalidCategories();
  }
  return { ids: v.ids };
}

function validateName(document: StoredDocument<NameEntry> | null, id: string): void {
  if (!document || document.value?.categoryId !== id) throw invalidCategories();
}

/** Revision checks that keep a bookmark from joining a category that was deleted meanwhile. */
export function selectionChecks(snapshot: CategorySnapshot, ids: string[]): Check[] {
  if (ids.length > 50 || new Set(ids).size !== ids.length) throw new GenesisError("INVALID_ARGUMENT", "Invalid category selection");
  const checks: Check[] = [{ collection: "category-meta", key: "active", expectedRevision: snapshot.meta?.revision ?? null }];
  for (const id of ids) {
    const category = snapshot.categories.find(record => record.value.id === id);
    if (!category) throw categoriesChanged();
    checks.push({ collection: "categories", key: id, expectedRevision: category.revision });
  }
  return checks;
}

/** A bookmark's categories that still exist; deleted ones leave it uncategorized. */
export const activeMembership = (ids: readonly string[], snapshot: CategorySnapshot): string[] =>
  ids.filter(id => snapshot.categories.some(record => record.value.id === id));

export const snapshotOf = (story: Story): StorySnapshot => ({
  itemId: story.id,
  discussionUrl: itemUrl(story.id),
  articleUrl: story.articleUrl,
  title: story.title,
  submitter: story.submitter,
  truncated: false,
  capturedAtMs: Date.now(),
});

// ---- Repositories ---------------------------------------------------------------------------

export class BookmarkRepository {
  constructor(readonly storage: Storage) {}

  async get(id: string): Promise<StoredDocument<BookmarkV1> | null> {
    if (!validItemId(id)) throw new GenesisError("INVALID_ARGUMENT", "Invalid story ID");
    const { document } = await this.storage.get("bookmarks", bookmarkKey(id));
    if (!document) return null;
    const value = validateBookmark(document.value);
    if (value.itemId !== id) throw new GenesisError("STORAGE_FAILURE", "Saved story identity mismatch. Data preserved.");
    return { ...document, value };
  }

  /** Creates or updates a bookmark. `refresh` replaces the stored story fields with `snapshot`. */
  async save(snapshot: StorySnapshot, previous: StoredDocument<BookmarkV1> | null, options: {
    categoryIds?: string[]; checks?: Check[]; refresh?: boolean;
  } = {}): Promise<void> {
    if (previous && previous.value.itemId !== snapshot.itemId) throw new GenesisError("INVALID_ARGUMENT", "Story identity changed");
    const time = previous?.value.savedAtMs ?? Date.now();
    const key = bookmarkKey(snapshot.itemId);
    const value = validateBookmark({
      ...(previous && !options.refresh ? previous.value : snapshot),
      schemaVersion: 1, savedAtMs: time, orderKey: orderKey(time, snapshot.itemId),
      categoryIds: options.categoryIds ?? previous?.value.categoryIds ?? [],
    });
    const checks: Check[] = [{ collection: "bookmarks", key, expectedRevision: previous?.revision ?? null }, ...(options.checks ?? [])];
    const puts = [{ collection: "bookmarks", key, value } as { collection: string; key: string; value: unknown }];
    if (!previous) {
      checks.push({ collection: "bookmark-order", key: value.orderKey, expectedRevision: null });
      puts.push({ collection: "bookmark-order", key: value.orderKey, value: { bookmarkKey: key } });
    }
    await this.storage.commit({ checks, puts });
  }

  async remove(previous: StoredDocument<BookmarkV1>): Promise<void> {
    const value = validateBookmark(previous.value);
    const key = bookmarkKey(value.itemId);
    const index = await this.storage.get<OrderEntry>("bookmark-order", value.orderKey);
    if (index.document && index.document.value.bookmarkKey !== key) {
      throw new GenesisError("STORAGE_FAILURE", "Bookmark index mismatch. Data preserved.");
    }
    await this.storage.commit({
      checks: [
        { collection: "bookmarks", key, expectedRevision: previous.revision },
        { collection: "bookmark-order", key: value.orderKey, expectedRevision: index.document?.revision ?? null },
      ],
      deletes: [{ collection: "bookmarks", key }, { collection: "bookmark-order", key: value.orderKey }],
    });
  }
}

export class CategoryRepository {
  constructor(readonly storage: Storage) {}

  /** Reads the active categories, retrying when another write lands between the reads. */
  async read(): Promise<CategorySnapshot> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const metaResult = await this.storage.get<CategoryMeta>("category-meta", "active");
      const meta = metaResult.document ? { ...metaResult.document, value: validateMeta(metaResult.document.value) } : null;
      const results = [];
      for (const id of meta?.value.ids ?? []) results.push(await this.storage.get("categories", id));
      if (results.some(result => result.namespaceRevision !== metaResult.namespaceRevision)) continue;
      const categories = results.map((result, index) => {
        if (!result.document) throw invalidCategories();
        const value = validateCategory(result.document.value);
        if (value.id !== meta!.value.ids[index] || value.deletedAtMs !== null) throw invalidCategories();
        return { ...result.document, value };
      });
      return { meta, categories, namespaceRevision: metaResult.namespaceRevision };
    }
    throw categoriesChanged();
  }

  async create(raw: string): Promise<string> {
    const name = categoryName(raw);
    const snapshot = await this.read();
    if (snapshot.categories.length >= 50) throw new GenesisError("QUOTA_EXCEEDED", "You can have up to 50 active categories.");
    if ((await this.storage.get("category-names", name.normalizedName)).document) throw sameName();
    const id = crypto.randomUUID();
    const value: CategoryV1 = { schemaVersion: 1, id, ...name, createdAtMs: Date.now(), deletedAtMs: null };
    await this.storage.commit({
      checks: [
        { collection: "category-meta", key: "active", expectedRevision: snapshot.meta?.revision ?? null },
        { collection: "categories", key: id, expectedRevision: null },
        { collection: "category-names", key: name.normalizedName, expectedRevision: null },
      ],
      puts: [
        { collection: "categories", key: id, value },
        { collection: "category-names", key: name.normalizedName, value: { categoryId: id } },
        { collection: "category-meta", key: "active", value: { ids: [...(snapshot.meta?.value.ids ?? []), id] } },
      ],
    });
    return id;
  }

  async rename(previous: StoredDocument<CategoryV1>, raw: string): Promise<void> {
    const old = validateCategory(previous.value);
    const name = categoryName(raw);
    if (old.deletedAtMs !== null) throw categoriesChanged();
    const current = await this.storage.get("categories", old.id);
    if (current.document?.revision !== previous.revision) throw categoriesChanged();
    if (old.normalizedName === name.normalizedName) {
      await this.storage.commit({
        checks: [{ collection: "categories", key: old.id, expectedRevision: previous.revision }],
        puts: [{ collection: "categories", key: old.id, value: { ...old, ...name } }],
      });
      return;
    }
    const [oldIndex, destination] = await Promise.all([
      this.storage.get<NameEntry>("category-names", old.normalizedName),
      this.storage.get("category-names", name.normalizedName),
    ]);
    validateName(oldIndex.document, old.id);
    if (destination.document) throw sameName();
    await this.storage.commit({
      checks: [
        { collection: "categories", key: old.id, expectedRevision: previous.revision },
        { collection: "category-names", key: old.normalizedName, expectedRevision: oldIndex.document!.revision },
        { collection: "category-names", key: name.normalizedName, expectedRevision: null },
      ],
      puts: [
        { collection: "categories", key: old.id, value: { ...old, ...name } },
        { collection: "category-names", key: name.normalizedName, value: { categoryId: old.id } },
      ],
      deletes: [{ collection: "category-names", key: old.normalizedName }],
    });
  }

  /** Soft delete: the category leaves the active list and its stories become uncategorized. */
  async remove(previous: StoredDocument<CategoryV1>): Promise<void> {
    const old = validateCategory(previous.value);
    const snapshot = await this.read();
    if (!snapshot.categories.some(record => record.value.id === old.id && record.revision === previous.revision)) throw categoriesChanged();
    const index = await this.storage.get<NameEntry>("category-names", old.normalizedName);
    validateName(index.document, old.id);
    await this.storage.commit({
      checks: [
        { collection: "categories", key: old.id, expectedRevision: previous.revision },
        { collection: "category-meta", key: "active", expectedRevision: snapshot.meta!.revision },
        { collection: "category-names", key: old.normalizedName, expectedRevision: index.document!.revision },
      ],
      puts: [
        { collection: "categories", key: old.id, value: { ...old, deletedAtMs: Math.max(Date.now(), old.createdAtMs) } },
        { collection: "category-meta", key: "active", value: { ids: snapshot.meta!.value.ids.filter(id => id !== old.id) } },
      ],
      deletes: [{ collection: "category-names", key: old.normalizedName }],
    });
  }
}

// ---- Hook -----------------------------------------------------------------------------------

export interface Library {
  bookmarks: StoredDocument<BookmarkV1>[];
  categories: CategorySnapshot | null;
  loading: boolean;
  /** The last read failure; the last good data stays visible beside it. */
  error: unknown;
  bookmarkRepository: BookmarkRepository;
  categoryRepository: CategoryRepository;
}

/** The repositories over this foreground's service storage. */
export function useRepositories() {
  const storage = serviceStorage(useForeground());
  return useMemo(() => ({
    storage,
    bookmarkRepository: new BookmarkRepository(storage),
    categoryRepository: new CategoryRepository(storage),
  }), [storage]);
}

/** A sentence for a library failure, pointing at Service connections when the service is not set up. */
export function libraryMessage(error: unknown): string {
  if ((error as { code?: string } | null)?.code === "CONFIGURATION_REQUIRED") {
    return "Saved stories need the bookmarks service. Connect it under Service connections in the Genesis menu.";
  }
  return serviceMessage(error);
}

/** Saved stories, newest first, and the active categories, reread after writes and on resume. */
export function useLibrary(): Library {
  const { storage, ...repositories } = useRepositories();
  const records = useRecords<unknown>("bookmarks", { storage });
  const [categories, setCategories] = useState<{ snapshot: CategorySnapshot | null; error: unknown }>({ snapshot: null, error: null });

  useEffect(() => {
    let active = true;
    let serial = 0;
    const load = () => {
      const current = ++serial;
      repositories.categoryRepository.read().then(
        snapshot => { if (active && current === serial) setCategories({ snapshot, error: null }); },
        error => { if (active && current === serial) setCategories(previous => ({ ...previous, error })); },
      );
    };
    load();
    const stop = storage.onChanged(change => {
      if (change.changes.some(entry => entry.collection.startsWith("categor"))) load();
    });
    return () => { active = false; stop(); };
  }, [storage, repositories]);

  useAppResume(() => storage.refresh());

  const bookmarks = useMemo(() => records.records.flatMap(record => {
    try { return [{ ...record, value: validateBookmark(record.value) }]; } catch { return []; }
  }).sort((a, b) => b.value.savedAtMs - a.value.savedAtMs), [records.records]);

  return {
    bookmarks,
    categories: categories.snapshot,
    loading: records.loading || (categories.snapshot === null && categories.error === null),
    error: records.error ?? categories.error,
    ...repositories,
  };
}
