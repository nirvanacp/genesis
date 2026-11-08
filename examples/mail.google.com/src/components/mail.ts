/**
 * Shared helpers for the mail screens: moving between Gmail's hash routes, remembering Gmail's
 * unread counts between screens, and turning an email into a stored item.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useNavigation, usePage } from "@genesis/sdk/react";
import {
  composeUrl, INBOX, listUrl, mailBase, menuUrl, newId, parseHash, searchUrl, threadUrl,
  type Item, type ItemType, type LinkedEmail, type MailView,
} from "../model";

export const CONTEXT = "primary";

/** The Gmail view the primary context's URL names. */
export function useMailView(): { view: MailView; base: string; url: string | null } {
  const page = usePage(CONTEXT);
  return useMemo(() => {
    let hash = "";
    try { hash = new URL(page.url ?? "").hash; } catch { /* no URL yet */ }
    return { view: parseHash(hash), base: mailBase(page.url), url: page.url };
  }, [page.url]);
}

/** Moves between Gmail screens. Every move is a URL, so Genesis keeps Gmail's own history. */
export function useMailNav() {
  const { navigate } = useNavigation();
  const { base } = useMailView();
  return useMemo(() => ({
    base,
    list: (path: string, mode: "push" | "replace" = "push") => navigate({ url: listUrl(base, path), context: CONTEXT, mode }),
    inbox: (mode: "push" | "replace" = "push") => navigate({ url: listUrl(base, INBOX.path), context: CONTEXT, mode }),
    thread: (threadId: string, listPath?: string) => navigate({ url: threadUrl(base, threadId, listPath), context: CONTEXT }),
    search: (query: string, mode: "push" | "replace" = "push") => navigate({ url: searchUrl(base, query), context: CONTEXT, mode }),
    compose: () => navigate({ url: composeUrl(base), context: CONTEXT }),
    menu: () => navigate({ url: menuUrl(base), context: CONTEXT }),
  }), [navigate, base]);
}

// ---------------------------------------------------------------------------------------------
// Gmail's counts, kept while the app runs. The drawer and list headers report what Gmail shows.

const counts = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

export function reportCount(id: string, value: number | null) {
  if (value === null || counts.get(id) === value) return;
  counts.set(id, value);
  version++;
  for (const listener of listeners) listener();
}

export function useCount(id: string): number | null {
  useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => version);
  return counts.get(id) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Items from email

export interface EmailSource extends LinkedEmail { accountId: string }

export function newItem(type: ItemType, source: EmailSource | null, accountId: string, patch: Partial<Item> = {}): Item {
  return {
    v: 1, id: newId(), type, title: source ? suggestTitle(source.subject) : "", note: "",
    dueDate: null, dueTime: null, notify: type === "reminder", repeat: "never", priority: "normal",
    link: source ? { threadId: source.threadId, sender: source.sender, subject: source.subject, snippet: source.snippet, receivedAt: source.receivedAt } : null,
    accountId: source?.accountId ?? accountId, source: "user", createdAt: Date.now(), completedAt: null, done: false,
    bringBack: type === "reminder", snooze: false, ...patch,
  };
}

/** Strips "Re:"/"Fwd:" so the prefilled title reads like a task. */
export function suggestTitle(subject: string): string {
  return subject.replace(/^((re|fwd?|fw|aw)\s*:\s*)+/i, "").trim().slice(0, 200) || "Follow up";
}

export function linkedTo(items: Item[], threadId: string | null | undefined): Item[] {
  if (!threadId) return [];
  return items.filter(item => item.link?.threadId === threadId);
}

/** Splits Gmail's "Priya Menon, me 3" into the first sender's name. */
export function firstSender(sender: string): string {
  return sender.split(/,| \d+$/)[0].replace(/\s+\d+$/, "").trim() || sender;
}

export function useOpenItem() {
  const { navigate } = useNavigation();
  return useCallback((id: string) => navigate({ screen: "item", params: { id } }), [navigate]);
}

/**
 * A reply asked for from an item's detail screen. The email has to be open before Gmail can
 * reply, so the item opens the thread and the conversation screen starts the reply once ready.
 */
export const pendingReply = { threadId: null as string | null };
