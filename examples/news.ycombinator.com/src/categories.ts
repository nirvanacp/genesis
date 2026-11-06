import { GenesisError, type AppletStorage, type StoredDocument, type StorageCheck } from "@genesis/sdk";
import { categoryId, timestamp } from "./repository";
import { readInBatches } from "./storage-utils";

export interface CategoryV1 {
  schemaVersion: 1; id: string; name: string; normalizedName: string;
  createdAtMs: number; deletedAtMs: number | null;
}
interface CategoryMeta { ids: string[] }
interface NameEntry { categoryId: string }
export interface CategorySnapshot {
  meta: StoredDocument<CategoryMeta> | null;
  categories: StoredDocument<CategoryV1>[];
  namespaceRevision: number;
}
const invalidData = () => new GenesisError("STORAGE_FAILURE", "Category data has an unsupported format. Its data has been preserved.");
const conflict = () => new GenesisError("CONFLICT", "Categories changed. Reload and review before retrying.");
export function categoryName(raw: string): { name: string; normalizedName: string } {
  const name = raw.trim();
  const normalizedName = name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  if (!name || [...name].length > 40 || !normalizedName || new TextEncoder().encode(normalizedName).length > 512) {
    throw new GenesisError("INVALID_ARGUMENT", "Use a category name of 1 to 40 characters.");
  }
  if (["all", "uncategorized"].includes(normalizedName)) throw new GenesisError("INVALID_ARGUMENT", "All and Uncategorized are reserved filter names.");
  return { name, normalizedName };
}
export function validateCategory(value: unknown): CategoryV1 {
  const v = value as Partial<CategoryV1> | null;
  try {
    if (!v || v.schemaVersion !== 1 || !categoryId(v.id) || typeof v.name !== "string"
      || !timestamp(v.createdAtMs) || !(v.deletedAtMs === null || timestamp(v.deletedAtMs) && v.deletedAtMs >= v.createdAtMs)) throw invalidData();
    const name = categoryName(v.name);
    if (v.name !== name.name || v.normalizedName !== name.normalizedName) throw invalidData();
    return v as CategoryV1;
  } catch { throw invalidData(); }
}
function validateMeta(value: unknown): CategoryMeta {
  const v = value as Partial<CategoryMeta> | null;
  if (!v || !Array.isArray(v.ids) || v.ids.length > 50 || !v.ids.every(categoryId) || new Set(v.ids).size !== v.ids.length) throw invalidData();
  return { ids: v.ids };
}
function validateName(document: StoredDocument<NameEntry> | null, id: string): void {
  if (!document || document.value?.categoryId !== id) throw invalidData();
}
export function selectionChecks(snapshot: CategorySnapshot, ids: string[]): StorageCheck[] {
  if (ids.length > 50 || new Set(ids).size !== ids.length) throw new GenesisError("INVALID_ARGUMENT", "Invalid category selection");
  const checks: StorageCheck[] = [{ collection: "category-meta", key: "active", expectedRevision: snapshot.meta?.revision ?? null }];
  for (const id of ids) {
    const category = snapshot.categories.find(record => record.value.id === id);
    if (!category) throw conflict();
    checks.push({ collection: "categories", key: id, expectedRevision: category.revision });
  }
  return checks;
}
export const activeMembership = (ids: readonly string[], snapshot: CategorySnapshot): string[] =>
  ids.filter(id => snapshot.categories.some(record => record.value.id === id));

export class CategoryRepository {
  constructor(readonly storage: AppletStorage) {}
  async read(): Promise<CategorySnapshot> {
    // Retry only reads when another operation changes the namespace between them.
    for (let attempt = 0; attempt < 3; attempt++) {
      const metaResult = await this.storage.get<CategoryMeta>("category-meta", "active");
      const meta = metaResult.document ? { ...metaResult.document, value: validateMeta(metaResult.document.value) } : null;
      const results = await readInBatches(meta?.value.ids ?? [], id => this.storage.get("categories", id));
      if (results.some(result => result.namespaceRevision !== metaResult.namespaceRevision)) continue;
      const categories = results.map((result, index) => {
        if (!result.document) throw invalidData();
        const value = validateCategory(result.document.value);
        if (value.id !== meta!.value.ids[index] || value.deletedAtMs !== null) throw invalidData();
        return { ...result.document, value };
      });
      return { meta, categories, namespaceRevision: metaResult.namespaceRevision };
    }
    throw conflict();
  }
  async create(raw: string): Promise<string> {
    const name = categoryName(raw), snapshot = await this.read();
    if (snapshot.categories.length >= 50) throw new GenesisError("QUOTA_EXCEEDED", "You can have up to 50 active categories.");
    const existing = await this.storage.get("category-names", name.normalizedName);
    if (existing.document) throw new GenesisError("CONFLICT", "A category with this name already exists.");
    const id = crypto.randomUUID();
    const value: CategoryV1 = { schemaVersion: 1, id, ...name, createdAtMs: Date.now(), deletedAtMs: null };
    await this.storage.commit({ checks: [
      { collection: "category-meta", key: "active", expectedRevision: snapshot.meta?.revision ?? null },
      { collection: "categories", key: id, expectedRevision: null },
      { collection: "category-names", key: name.normalizedName, expectedRevision: null },
    ], puts: [
      { collection: "categories", key: id, value },
      { collection: "category-names", key: name.normalizedName, value: { categoryId: id } },
      { collection: "category-meta", key: "active", value: { ids: [...(snapshot.meta?.value.ids ?? []), id] } },
    ], deletes: [] });
    return id;
  }
  async rename(previous: StoredDocument<CategoryV1>, raw: string): Promise<void> {
    const old = validateCategory(previous.value), name = categoryName(raw);
    if (old.deletedAtMs !== null) throw conflict();
    const current = await this.storage.get("categories", old.id);
    if (current.document?.revision !== previous.revision) throw conflict();
    if (old.normalizedName === name.normalizedName) {
      await this.storage.commit({ checks: [{ collection: "categories", key: old.id, expectedRevision: previous.revision }],
        puts: [{ collection: "categories", key: old.id, value: { ...old, ...name } }], deletes: [] });
      return;
    }
    const [oldIndex, destination] = await Promise.all([
      this.storage.get<NameEntry>("category-names", old.normalizedName), this.storage.get("category-names", name.normalizedName),
    ]);
    validateName(oldIndex.document, old.id);
    if (destination.document) throw new GenesisError("CONFLICT", "A category with this name already exists.");
    await this.storage.commit({ checks: [
      { collection: "categories", key: old.id, expectedRevision: previous.revision },
      { collection: "category-names", key: old.normalizedName, expectedRevision: oldIndex.document!.revision },
      { collection: "category-names", key: name.normalizedName, expectedRevision: null },
    ], puts: [
      { collection: "categories", key: old.id, value: { ...old, ...name } },
      { collection: "category-names", key: name.normalizedName, value: { categoryId: old.id } },
    ], deletes: [{ collection: "category-names", key: old.normalizedName }] });
  }
  async remove(previous: StoredDocument<CategoryV1>): Promise<void> {
    const old = validateCategory(previous.value), snapshot = await this.read();
    if (!snapshot.categories.some(record => record.value.id === old.id && record.revision === previous.revision)) throw conflict();
    const index = await this.storage.get<NameEntry>("category-names", old.normalizedName);
    validateName(index.document, old.id);
    await this.storage.commit({ checks: [
      { collection: "categories", key: old.id, expectedRevision: previous.revision },
      { collection: "category-meta", key: "active", expectedRevision: snapshot.meta!.revision },
      { collection: "category-names", key: old.normalizedName, expectedRevision: index.document!.revision },
    ], puts: [
      { collection: "categories", key: old.id, value: { ...old, deletedAtMs: Math.max(Date.now(), old.createdAtMs) } },
      { collection: "category-meta", key: "active", value: { ids: snapshot.meta!.value.ids.filter(id => id !== old.id) } },
    ], deletes: [{ collection: "category-names", key: old.normalizedName }] });
  }
}
