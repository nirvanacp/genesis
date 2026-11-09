/**
 * The applet's own data: reminders and to-dos (`items`), Google accounts (`accounts`) and
 * preferences (`settings/prefs`). Everything lives in Genesis storage on the device, so items
 * save without a connection. Each hook reloads after every change to its collection.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePage, useRecord, useRecords } from "@genesis/sdk/react";
import {
  ACCOUNT_COLORS, accountIdOf, DEFAULT_SETTINGS, defaultAccountName, isObject, nextOccurrence, validAccount, validItem,
  type Account, type Item, type Settings,
} from "./model";

export interface ItemsApi {
  items: Item[];
  loading: boolean;
  error: unknown;
  save(item: Item): Promise<void>;
  saveMany(items: Item[]): Promise<void>;
  remove(id: string): Promise<void>;
  removeMany(ids: string[]): Promise<void>;
  /** Marks done; a repeating reminder moves to its next date instead. */
  complete(item: Item, done: boolean): Promise<void>;
}

export interface AccountsApi {
  accounts: Account[];
  /** The account Gmail is signed in to in this context. */
  current: Account | null;
  byId(id: string): Account | undefined;
  save(account: Account): Promise<void>;
}

export interface SettingsApi {
  settings: Settings;
  update(patch: Partial<Settings>): Promise<void>;
}

interface Data { items: ItemsApi; accounts: AccountsApi; settings: SettingsApi }

const DataContext = createContext<Data | null>(null);

function useItemsStore(): ItemsApi {
  const records = useRecords<Item>("items");
  const items = useMemo(() => records.records.map(record => record.value).filter(validItem), [records.records]);
  const revisions = useMemo(() => new Map(records.records.map(record => [record.key, record.revision])), [records.records]);
  const revisionOf = (id: string) => revisions.get(id) ?? null;

  const saveMany = useCallback(async (next: Item[]) => {
    if (!next.length) return;
    await records.commit({
      checks: next.map(item => ({ collection: "items", key: item.id, expectedRevision: revisionOf(item.id) })),
      puts: next.map(item => ({ collection: "items", key: item.id, value: item })),
    });
  }, [records, revisions]);

  const removeMany = useCallback(async (ids: string[]) => {
    const present = ids.filter(id => revisions.has(id));
    if (!present.length) return;
    await records.commit({
      checks: present.map(id => ({ collection: "items", key: id, expectedRevision: revisionOf(id) })),
      deletes: present.map(id => ({ collection: "items", key: id })),
    });
  }, [records, revisions]);

  const complete = useCallback(async (item: Item, done: boolean) => {
    if (done && item.type === "reminder" && item.repeat !== "never" && item.dueDate) {
      await saveMany([{ ...item, dueDate: nextOccurrence(item.dueDate, item.repeat), returned: false }]);
      return;
    }
    await saveMany([{ ...item, done, completedAt: done ? Date.now() : null }]);
  }, [saveMany]);

  return {
    items, loading: records.loading, error: records.error,
    save: item => saveMany([item]), saveMany,
    remove: id => removeMany([id]), removeMany, complete,
  };
}

function useAccountsStore(): AccountsApi {
  const records = useRecords<Account>("accounts");
  const page = usePage("primary");
  const accounts = useMemo(() => records.records.map(record => record.value).filter(validAccount)
    .sort((a, b) => a.addedAt - b.addedAt), [records.records]);
  const email = page.account;
  // The adapter reads Gmail's session index from the page; the URL carries it only before Gmail settles.
  const session = useRecord<{ session?: number | null }>("view", null, "primary")?.data.session;
  const index = typeof session === "number" ? session : sessionIndexOf(page.url);

  const save = useCallback(async (account: Account) => { await records.put(account.id, account); }, [records]);

  // The first time Gmail shows a signed-in account, record it with the next unused color.
  // A known account keeps the index Gmail gives it now: Google renumbers sessions after a sign-out.
  const adding = useRef<string | null>(null);
  useEffect(() => {
    if (records.loading || !email) return;
    const id = accountIdOf(email);
    const known = accounts.find(account => account.id === id);
    if (known) {
      if (index !== null && known.sessionIndex !== index) void records.put(id, { ...known, sessionIndex: index }).catch(() => undefined);
      return;
    }
    if (adding.current === id) return;
    adding.current = id;
    const used = new Set(accounts.map(account => account.color));
    const color = ACCOUNT_COLORS.find(value => !used.has(value)) ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length];
    void records.put(id, {
      v: 1, id, email, name: defaultAccountName(email, accounts.map(account => account.name)), color, sessionIndex: index ?? 0, showInInbox: true, showInTodo: true, addedAt: Date.now(),
    }, null).catch(() => { adding.current = null; });
  }, [records, accounts, email, index]);

  const byId = useCallback((id: string) => accounts.find(account => account.id === id), [accounts]);
  const current = email ? byId(accountIdOf(email)) ?? null : null;
  return { accounts, current, byId, save };
}

/** The session index in `/mail/u/<n>/` or `?authuser=<n>`, or null when the URL has neither. */
function sessionIndexOf(url: string | null): number | null {
  const match = /\/mail\/u\/(\d+)\/|[?&]authuser=(\d+)/.exec(url ?? "");
  return match ? Number(match[1] ?? match[2]) : null;
}

function useSettingsStore(): SettingsApi {
  const records = useRecords<Settings>("settings");
  const stored = records.records.find(record => record.key === "prefs")?.value;
  const settings = useMemo<Settings>(() => ({ ...DEFAULT_SETTINGS, ...(isObject(stored) ? stored : {}) }), [stored]);
  const update = useCallback(async (patch: Partial<Settings>) => {
    await records.put("prefs", { ...settings, ...patch, v: 1 });
  }, [records, settings]);
  return { settings, update };
}

/** Loads the data once for every screen. */
export function DataProvider({ children }: { children: ReactNode }) {
  const items = useItemsStore();
  const accounts = useAccountsStore();
  const settings = useSettingsStore();
  const value = useMemo(() => ({ items, accounts, settings }), [items, accounts, settings]);
  return createElement(DataContext.Provider, { value }, children);
}

function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error("DataProvider is missing");
  return data;
}

export const useItems = () => useData().items;
export const useAccounts = () => useData().accounts;
export const useSettings = () => useData().settings;

/** Removes done items older than the setting allows, once per launch. */
export function usePurgeDone() {
  const { items, loading, removeMany } = useItems();
  const { settings } = useSettings();
  const ran = useRef(false);
  useEffect(() => {
    if (loading || ran.current) return;
    ran.current = true;
    const cutoff = Date.now() - settings.keepDoneDays * 86_400_000;
    const old = items.filter(item => item.done && (item.completedAt ?? 0) < cutoff).map(item => item.id);
    if (old.length) void removeMany(old).catch(() => {});
  }, [loading, items, settings.keepDoneDays, removeMany]);
}

// ---------------------------------------------------------------------------------------------
// Toasts: one at a time, with an optional Undo and View.

export interface Toast { id: number; text: string; undo?: () => void; view?: () => void }

const ToastContext = createContext<{ toast: Toast | null; show(toast: Omit<Toast, "id">): void; clear(): void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);
  const show = useCallback((next: Omit<Toast, "id">) => {
    window.clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...next, id });
    timer.current = window.setTimeout(() => setToast(current => (current?.id === id ? null : current)), next.undo ? 6000 : 3500);
  }, []);
  const clear = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ toast, show, clear }), [toast, show, clear]);
  return createElement(ToastContext.Provider, { value }, children);
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("ToastProvider is missing");
  return value;
}

/** A clock that ticks each minute, so presets and groups stay current while a screen is open. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
