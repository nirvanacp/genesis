/**
 * The data Gmail Only works with: what the adapter reads from Gmail's mobile web pages, the
 * reminders and to-dos the applet stores, and the date rules both forms and lists share.
 * Nothing here touches the DOM, so the adapter and the foreground both import it.
 */

export const ORIGIN = "https://mail.google.com";
/** Gmail's mobile web app. `/mail/u/N/` redirects here for the signed-in session. */
export const MOBILE_PATH = "/mail/mu/mp/239/";

/**
 * Multi-account switch. Everything account-aware (colors, filters, the switcher, account setup)
 * is built and stored per account; turning this off hides the entry points that add or switch to
 * a second Google session. See `.specs/decisions.md` (decision-0006 and decision-0010).
 */
export const MULTI_ACCOUNT_ENABLED = true;

// ---------------------------------------------------------------------------------------------
// What the adapter reads

/** A run of email text. Links keep a validated https target; nothing is ever HTML. */
export interface TextRun { text: string; href?: string; bold?: boolean }

export interface ThreadRow {
  threadId: string;
  /** Senders as Gmail lists them, e.g. "Priya Menon, Arjun 3". */
  sender: string;
  subject: string;
  snippet: string;
  /** Gmail's short date: "9:42 AM", "Yesterday", "Nov 4". */
  date: string;
  unread: boolean;
  starred: boolean;
  selected: boolean;
  attachment: boolean;
  /** Label chips Gmail shows in search results, such as "Inbox". */
  labels: string[];
}

export interface ListInfo {
  /** Gmail's header title, such as "Primary" or "Starred". */
  title: string;
  /** Gmail's unread count in the header, when it shows one. */
  unread: number | null;
  /** Gmail's own empty-state text ("You have no mail here."), or null. */
  empty: string | null;
  /** Number of selected rows in Gmail's selection bar. */
  selected: number;
}

/** `href` is Gmail's page that shows the file, set only for files the app can show. */
export interface Attachment { name: string; size: string; href?: string }

export interface Message {
  id: string;
  sender: string;
  initial: string;
  /** "to me" plus Gmail's relative time ("23 minutes ago"), as Gmail shows it. */
  recipients: string;
  time: string;
  snippet: string;
  /** The message body as text runs; empty when Gmail shows the message collapsed. */
  body: TextRun[];
  truncated: boolean;
  attachments: Attachment[];
}

export interface Conversation {
  subject: string;
  starred: boolean;
  labels: string[];
  messages: Message[];
  /** Toolbar commands Gmail offers for this conversation right now. */
  commands: ConversationCommand[];
}

export type ConversationCommand = "archive" | "trash" | "deleteForever" | "notSpam" | "moveToInbox" | "mute" | "markUnread" | "spam";

export interface ComposeState {
  from: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  /** Plain text of Gmail's body field, bounded; replies start with Gmail's quoted text hidden. */
  body: string;
}

export interface MenuEntry {
  /** Gmail's command argument: `^smartlabel_personal`, `^t`, a label name. */
  arg: string;
  kind: "category" | "system" | "label";
  label: string;
  count: number | null;
}

export interface MenuAccount { email: string }

// ---------------------------------------------------------------------------------------------
// Gmail's mobile hash routes

export interface MailList {
  /** The path after `#tl/`, kept exactly as Gmail encodes it. */
  path: string;
  id: string;
  title: string;
  /** The search query for `#tl/search/<q>`. */
  query?: string;
}

export type MailView =
  | { kind: "list"; list: MailList }
  | { kind: "conversation"; list: MailList; threadId: string }
  | { kind: "compose" }
  | { kind: "menu" }
  | { kind: "settings" }
  | { kind: "other"; hash: string };

/** Gmail lists with a known path, in the order the drawer shows them. */
export const LISTS: { id: string; path: string; title: string; arg: string; icon: string; category?: boolean }[] = [
  { id: "primary", path: "priority/%5Esmartlabel_personal", title: "Primary", arg: "^smartlabel_personal", icon: "inbox", category: true },
  { id: "promotions", path: "priority/%5Esmartlabel_promo", title: "Promotions", arg: "^smartlabel_promo", icon: "tag", category: true },
  { id: "social", path: "priority/%5Esmartlabel_social", title: "Social", arg: "^smartlabel_social", icon: "people", category: true },
  { id: "starred", path: "Starred", title: "Starred", arg: "^t", icon: "star" },
  { id: "important", path: "Important", title: "Important", arg: "^io_im", icon: "important" },
  { id: "sent", path: "Sent%20Mail", title: "Sent", arg: "^f", icon: "send" },
  { id: "drafts", path: "Drafts", title: "Drafts", arg: "^r", icon: "draft" },
  { id: "all", path: "All%20Mail", title: "All mail", arg: "^all", icon: "mail" },
  { id: "spam", path: "Spam", title: "Spam", arg: "^s", icon: "alert" },
  { id: "trash", path: "Trash", title: "Trash", arg: "^k", icon: "trash" },
];

export const INBOX = LISTS[0];

function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/** The list a `#tl/` path names. */
export function listOf(path: string): MailList {
  if (path.startsWith("search/")) {
    const query = decode(path.slice("search/".length));
    return { path, id: "search", title: "Search", query };
  }
  const known = LISTS.find(list => list.path === path || decode(list.path) === decode(path));
  if (known) return { path: known.path, id: known.id, title: known.title };
  return { path, id: `label:${decode(path)}`, title: decode(path).replace(/^.*\//, "") };
}

/** Classifies Gmail's mobile hash. Conversation hashes end in the thread id after the list path. */
export function parseHash(hash: string): MailView {
  const value = hash.replace(/^#/, "");
  if (value === "" ) return { kind: "list", list: listOf(INBOX.path) };
  if (value.startsWith("tl/")) return { kind: "list", list: listOf(value.slice(3)) };
  if (value.startsWith("cv/")) {
    const rest = value.slice(3);
    const cut = rest.lastIndexOf("/");
    const threadId = cut >= 0 ? rest.slice(cut + 1) : rest;
    const listPath = cut >= 0 ? rest.slice(0, cut) : INBOX.path;
    if (/^[0-9a-f]{6,24}$/i.test(threadId)) return { kind: "conversation", list: listOf(listPath), threadId };
  }
  if (value === "co" || value.startsWith("co?") || value.startsWith("co/")) return { kind: "compose" };
  if (value === "mn" || value.startsWith("mn/")) return { kind: "menu" };
  if (value === "pr" || value.startsWith("pr/")) return { kind: "settings" };
  return { kind: "other", hash: value };
}

/**
 * The base of every Gmail URL in this session: the mobile app path the page is on. Each Google
 * session has its own path (`/mail/mu/mp/<n>/`); before Gmail settles on it the page can be at
 * `/mail/mu/?authuser=N`, so the query is kept too.
 */
export function mailBase(url: string | null | undefined): string {
  try {
    const parsed = new URL(url ?? "");
    if (parsed.origin === ORIGIN && parsed.pathname.startsWith("/mail/mu/")) return `${ORIGIN}${parsed.pathname}${parsed.search}`;
  } catch { /* fall through */ }
  return `${ORIGIN}${MOBILE_PATH}`;
}

/**
 * The base for one account's Google session. Gmail moves to that session's own path and keeps
 * the hash. `authuser` takes the address, which stays right when Google renumbers its sessions
 * after a sign-out; the session index is the fallback for an account saved without one.
 */
export const sessionBase = (account: Pick<Account, "email" | "sessionIndex">) =>
  `${ORIGIN}/mail/mu/?authuser=${encodeURIComponent(account.email || String(account.sessionIndex))}`;
export const listUrl = (base: string, path: string) => `${base}#tl/${path}`;
export const searchUrl = (base: string, query: string) => `${base}#tl/search/${encodeURIComponent(query.trim())}`;
export const threadUrl = (base: string, threadId: string, listPath = "All%20Mail") => `${base}#cv/${listPath}/${threadId}`;
export const composeUrl = (base: string) => `${base}#co`;
export const menuUrl = (base: string) => `${base}#mn`;

// ---------------------------------------------------------------------------------------------
// Stored records

export type ItemType = "reminder" | "todo";
export type Repeat = "never" | "daily" | "weekdays" | "weekly" | "monthly";
export type Priority = "normal" | "high";

export interface LinkedEmail {
  threadId: string | null;
  sender: string;
  subject: string;
  snippet: string;
  /** "Today, 9:42 AM" as Gmail showed it when saved. */
  receivedAt: string;
  /** Set when the applet saw that Gmail no longer has the thread. */
  deleted?: boolean;
}

/** One reminder or to-do. Stored in collection `items`, keyed by `id`. */
export interface Item {
  v: 1;
  id: string;
  type: ItemType;
  title: string;
  note: string;
  /** Local date `YYYY-MM-DD`, or null for an undated to-do. */
  dueDate: string | null;
  /** Local time `HH:MM`, or null. A reminder always has one. */
  dueTime: string | null;
  /** A to-do with a time notifies; the brief calls this "Add a time & notify me". */
  notify: boolean;
  repeat: Repeat;
  priority: Priority;
  link: LinkedEmail | null;
  /** The account the email came from, or the selected account for a manual item. */
  accountId: string;
  /** Who added the item. Version 1 only has "user"; a later AI source would be labeled separately. */
  source: "user";
  createdAt: number;
  completedAt: number | null;
  done: boolean;
  /** Snooze: the email was archived and comes back to the top of the inbox when due. */
  bringBack: boolean;
  /** True for an email snooze; snoozes live in the drawer's Snoozed list, not in To-do. */
  snooze: boolean;
  /** Set once the inbox showed the item as back; cleared items no longer show there. */
  returned?: boolean;
}

export const ACCOUNT_COLORS = ["#2347d9", "#b5470b", "#1f7a4d", "#7b2d8e", "#0e7490", "#3d4250"] as const;
export const COLOR_NAMES = ["Blue", "Rust", "Green", "Plum", "Teal", "Graphite"];

/** One Google account. Stored in collection `accounts`, keyed by `id` (the lowercased email). */
export interface Account {
  v: 1;
  id: string;
  email: string;
  name: string;
  color: string;
  /** Gmail's session index (`authuser`), read from the open page; Google renumbers it after a sign-out. */
  sessionIndex: number;
  showInInbox: boolean;
  showInTodo: boolean;
  addedAt: number;
}

export type SortMode = "due" | "added";
export type Theme = "system" | "light" | "dark";

/** Stored in collection `settings` under key `prefs`. */
export interface Settings {
  v: 1;
  showAddTo: boolean;
  defaultSort: SortMode;
  /** `HH:MM`. Used by "Tomorrow", "Next week" and the quick presets. */
  defaultReminderTime: string;
  morningSummary: string | null;
  archiveAfterAdding: boolean;
  keepDoneDays: number;
  swipeRight: "remind" | "archive" | "none";
  swipeLeft: "remind" | "archive" | "none";
  theme: Theme;
  /** "all" or an account id. */
  todoAccount: string;
  recentSearches: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  showAddTo: true,
  defaultSort: "due",
  defaultReminderTime: "09:00",
  morningSummary: "08:00",
  archiveAfterAdding: true,
  keepDoneDays: 7,
  swipeRight: "remind",
  swipeLeft: "archive",
  theme: "system",
  todoAccount: "all",
  recentSearches: [],
};

export const accountIdOf = (email: string) => email.trim().toLowerCase();

/** A short name from an email: "Personal" for consumer Gmail, else the domain; the address's name when another account has it. */
export function defaultAccountName(email: string, taken: readonly string[] = []): string {
  const [local = "", host = ""] = email.split("@");
  const domain = host.toLowerCase();
  const word = domain === "gmail.com" || domain === "googlemail.com" ? "Personal" : domain.split(".")[0] ?? "";
  const name = word ? word[0].toUpperCase() + word.slice(1) : email;
  // A second account on the same domain would read the same everywhere, so it takes its address's name.
  return taken.includes(name) && local ? local : name;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export function validItem(value: unknown): value is Item {
  if (!isObject(value) || value.v !== 1) return false;
  return typeof value.id === "string" && (value.type === "reminder" || value.type === "todo") && typeof value.title === "string"
    && (value.dueDate === null || (typeof value.dueDate === "string" && DATE.test(value.dueDate)))
    && (value.dueTime === null || (typeof value.dueTime === "string" && TIME.test(value.dueTime)))
    && typeof value.done === "boolean" && typeof value.createdAt === "number" && typeof value.accountId === "string";
}

export function validAccount(value: unknown): value is Account {
  return isObject(value) && value.v === 1 && typeof value.id === "string" && typeof value.email === "string"
    && typeof value.name === "string" && typeof value.color === "string";
}

// ---------------------------------------------------------------------------------------------
// Dates. Items keep local calendar dates; all math happens in the device's time zone.

const pad = (value: number) => String(value).padStart(2, "0");

export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const timeKey = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function at(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const next = startOfDay(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

/** The moment an item is due: its date at its time, or at the end of the day when it has none. */
export function dueMoment(item: Pick<Item, "dueDate" | "dueTime">): Date | null {
  if (!item.dueDate) return null;
  return at(parseDate(item.dueDate), item.dueTime ?? "23:59");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const weekday = (date: Date) => WEEKDAYS[date.getDay()];
/** "Sat, 7 Nov" */
export const longDay = (date: Date) => `${weekday(date)}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
/** "Nov 19" */
export const shortDay = (date: Date) => `${MONTHS[date.getMonth()]} ${date.getDate()}`;

/** "9:00 AM" */
export function clock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${pad(minutes)} ${suffix}`;
}

/** Days from today to `date`: 0 today, 1 tomorrow, -1 yesterday. */
export function dayOffset(date: Date, now = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", "Sun" within the week, else "Sun, 15 Nov". */
export function relativeDay(date: Date, now = new Date()): string {
  const offset = dayOffset(date, now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  if (offset > 1 && offset < 7) return weekday(date);
  return longDay(date);
}

/** "Today, 2:30 PM", "Sun, 9:00 AM", "Due Fri 13 Nov". */
export function whenLabel(item: Pick<Item, "dueDate" | "dueTime">, now = new Date()): string {
  if (!item.dueDate) return "No date";
  const date = parseDate(item.dueDate);
  const day = relativeDay(date, now);
  return item.dueTime ? `${day}, ${clock(item.dueTime)}` : day;
}

/** The short tag the lists show on the right: "Today 3:00 PM", "Due today", "Sun 5:30 AM", "Due Fri 6 Nov". */
export function dueTag(item: Pick<Item, "dueDate" | "dueTime">, now = new Date()): string {
  if (!item.dueDate) return "";
  const date = parseDate(item.dueDate);
  const offset = dayOffset(date, now);
  const word = offset === 0 ? "today" : offset === 1 ? "tomorrow" : offset === -1 ? "yesterday"
    : offset > 1 && offset < 7 ? weekday(date) : `${weekday(date)} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  if (!item.dueTime) return `Due ${word}`;
  return `${word[0].toUpperCase()}${word.slice(1)} ${clock(item.dueTime)}`;
}

export function formatAdded(createdAt: number, now = new Date()): string {
  const date = new Date(createdAt);
  const day = relativeDay(date, now);
  return `${day === "Today" ? "today" : day === "Yesterday" ? "yesterday" : day}, ${clock(timeKey(date))}`;
}

/** The next date a repeating reminder is due after `from`. */
export function nextOccurrence(dueDate: string, repeat: Repeat): string {
  let date = parseDate(dueDate);
  const today = startOfDay(new Date());
  do {
    if (repeat === "daily") date = addDays(date, 1);
    else if (repeat === "weekly") date = addDays(date, 7);
    else if (repeat === "monthly") date = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate());
    else if (repeat === "weekdays") { do date = addDays(date, 1); while (date.getDay() === 0 || date.getDay() === 6); }
    else break;
  } while (date < today);
  return dateKey(date);
}

export const REPEAT_LABELS: Record<Repeat, string> = {
  never: "Never", daily: "Every day", weekdays: "Every weekday", weekly: "Every week", monthly: "Every month",
};

// ---------------------------------------------------------------------------------------------
// Presets. Each shows the actual time it means; presets already in the past are left out.

export interface Preset { id: string; label: string; date: Date; detail: string }

function roundUp(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setSeconds(0, 0);
  const step = minutes * 60_000;
  return new Date(Math.ceil(next.getTime() / step) * step);
}

/** "Today, 2:30 PM" / "Sun, 9:00 AM" for a preset. */
export function presetDetail(date: Date, now = new Date()): string {
  return `${relativeDay(date, now)}, ${clock(timeKey(date))}`;
}

/** The six reminder presets, minus those that would already be past. "Pick" is added by the form. */
export function reminderPresets(defaultTime: string, now = new Date()): Preset[] {
  const today = startOfDay(now);
  const presets: Preset[] = [];
  const hour = roundUp(new Date(now.getTime() + 60 * 60_000), 5);
  presets.push({ id: "hour", label: "In 1 hour", date: hour, detail: clock(timeKey(hour)) });
  const later = roundUp(new Date(now.getTime() + 3 * 60 * 60_000), 30);
  // Only during waking hours, so "Later today" is never 4 AM.
  if (dayOffset(later, now) === 0 && later.getHours() >= 8 && later.getHours() < 22) {
    presets.push({ id: "later", label: "Later today", date: later, detail: presetDetail(later, now) });
  }
  const tomorrow = at(addDays(today, 1), defaultTime);
  presets.push({ id: "tomorrow", label: "Tomorrow", date: tomorrow, detail: presetDetail(tomorrow, now) });
  const monday = at(addDays(today, ((8 - today.getDay()) % 7) || 7), defaultTime);
  presets.push({ id: "week", label: "Next week", date: monday, detail: presetDetail(monday, now) });
  // This weekend: Saturday 10 AM; on Saturday, Sunday 10 AM; on Sunday there is no weekend left.
  if (today.getDay() !== 0) {
    const saturday = at(addDays(today, (6 - today.getDay() + 7) % 7), "10:00");
    const weekend = saturday > now ? saturday : at(addDays(today, 1), "10:00");
    if (weekend > now && weekend.getDay() !== 1) presets.push({ id: "weekend", label: "This weekend", date: weekend, detail: presetDetail(weekend, now) });
  }
  return presets;
}

/** The one-tap presets under the "Add to…" menu. */
export function quickPresets(defaultTime: string, now = new Date()): Preset[] {
  const today = startOfDay(now);
  const presets: Preset[] = [];
  const evening = at(today, "18:00");
  if (evening > now) presets.push({ id: "evening", label: "Today 6 PM", date: evening, detail: "" });
  else {
    const night = at(today, "21:00");
    if (night > now) presets.push({ id: "night", label: "Tonight 9 PM", date: night, detail: "" });
  }
  const tomorrow = at(addDays(today, 1), defaultTime);
  presets.push({ id: "tomorrow", label: `Tomorrow ${clock(defaultTime).replace(":00", "")}`, date: tomorrow, detail: "" });
  return presets;
}

export type DueChoice = "none" | "today" | "tomorrow" | "week" | "pick";

/** The date a to-do due chip means. "This week" is Friday, or Sunday when Friday has passed. */
export function dueDateFor(choice: DueChoice, picked: string | null, now = new Date()): string | null {
  const today = startOfDay(now);
  if (choice === "today") return dateKey(today);
  if (choice === "tomorrow") return dateKey(addDays(today, 1));
  if (choice === "week") {
    const toFriday = (5 - today.getDay() + 7) % 7;
    const day = today.getDay() === 6 || today.getDay() === 0 || toFriday < 2 ? addDays(today, (7 - today.getDay()) % 7 || 0) : addDays(today, toFriday);
    return dateKey(day < addDays(today, 2) ? addDays(today, 2) : day);
  }
  if (choice === "pick") return picked;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Grouping for the To-do tab

export type DueGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "none" | "done";

export function dueGroup(item: Item, now = new Date()): DueGroup {
  if (item.done) return "done";
  if (!item.dueDate) return "none";
  const offset = dayOffset(parseDate(item.dueDate), now);
  if (offset < 0) return "overdue";
  if (offset === 0) return "today";
  if (offset === 1) return "tomorrow";
  if (offset < 7) return "week";
  return "later";
}

/** Inside a day: undated-time to-dos first ("Anytime today"), then timed items in time order. */
export function byDue(a: Item, b: Item): number {
  if ((a.dueDate ?? "9") !== (b.dueDate ?? "9")) return (a.dueDate ?? "9") < (b.dueDate ?? "9") ? -1 : 1;
  if (!a.dueTime !== !b.dueTime) return a.dueTime ? 1 : -1;
  if ((a.dueTime ?? "") !== (b.dueTime ?? "")) return (a.dueTime ?? "") < (b.dueTime ?? "") ? -1 : 1;
  if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** Items the To-do badge counts: open, not snoozes, due today or earlier. */
export function isDueNow(item: Item, now = new Date()): boolean {
  if (item.done || item.snooze || !item.dueDate) return false;
  return dayOffset(parseDate(item.dueDate), now) <= 0;
}

/** A snooze or bring-back reminder whose time has come. */
export function isBack(item: Item, now = new Date()): boolean {
  if (item.done || !item.bringBack || !item.link?.threadId) return false;
  const due = dueMoment(item);
  return due !== null && due <= now;
}

export function initials(name: string): string {
  const words = name.replace(/[<(].*$/, "").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** A stable soft color for a sender's avatar, from its name. */
export function avatarHue(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value % 360;
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
