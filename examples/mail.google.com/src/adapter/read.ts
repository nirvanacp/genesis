import type { Attachment, ComposeState, Conversation, ConversationCommand, ListInfo, MenuEntry, Message, TextRun, ThreadRow } from "../model.ts";

/**
 * Reading Gmail's mobile web app (`/mail/mu/mp/…`). Gmail renders each screen into one child of
 * `#views`: `tl_` the thread list, `cv_` a conversation, `co_` compose, `mn_` the menu and `pr_`
 * settings. Buttons carry `data-control-type` and `data-onclick-arg` attributes, which are what
 * these readers and the actions key on. Everything read is bounded plain text.
 */

export const VIEW_IDS = ["tl_", "cv_", "co_", "mn_", "pr_"] as const;
export type ViewId = typeof VIEW_IDS[number];

export const ROW = '[role="listitem"][id^="th_"]';

/** Collapses whitespace, drops Gmail's zero-width filler characters and bounds the length. */
export function clean(value: string | null | undefined, limit = 300): string {
  const text = (value ?? "").replace(/[​-‏⁠﻿͏]/g, "").replace(/\s+/g, " ").trim();
  return [...text].slice(0, limit).join("");
}

export function hash(text: string): string {
  let value = 5381;
  for (const char of text) value = (value * 33 + char.charCodeAt(0)) >>> 0;
  return value.toString(36);
}

function visible(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style ? style.display !== "none" && style.visibility !== "hidden" : element.offsetParent !== null;
}

/** The view Gmail is showing now, or null while it has none. */
export function visibleView(doc: Document): ViewId | null {
  for (const id of VIEW_IDS) {
    if (visible(doc.getElementById(id))) return id;
  }
  return null;
}

/** The email address of the signed-in session, from Gmail's bootstrap script. */
export function sessionEmail(doc: Document): string | null | undefined {
  for (const script of doc.scripts) {
    const match = /USER_EMAIL\s*=\s*"([^"@\s]+@[^"\s]+)"/.exec(script.textContent ?? "");
    if (match) return match[1].toLowerCase();
  }
  return undefined;
}

const sessions = new WeakMap<Document, number | null>();

/**
 * Gmail's session index for this page (the `N` of `/mail/u/N/` and `?authuser=N`). The mobile app
 * path (`/mail/mu/mp/<n>/`) does not carry it, so it is read once per document from the bootstrap
 * script, where Gmail writes `authuser=N` for its own links.
 */
export function sessionIndex(doc: Document): number | null {
  if (sessions.has(doc)) return sessions.get(doc)!;
  let index: number | null = null;
  for (const script of doc.scripts) {
    const match = /authuser\\u003d(\d+)/.exec(script.textContent ?? "");
    if (match) { index = Number(match[1]); break; }
  }
  sessions.set(doc, index);
  return index;
}

/** Google's sign-in page, or Gmail's "choose an account" page, means no Gmail session. */
export function account(doc: Document): string | null | undefined {
  if (doc.location.hostname !== "mail.google.com") return null;
  const email = sessionEmail(doc);
  if (email) return email;
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Thread list

export const threadIdOf = (row: Element) => row.id.replace(/^th_/, "");

const checked = (element: Element | null) => element?.getAttribute("aria-checked") === "true";

export function readThread(row: Element): ThreadRow {
  const id = threadIdOf(row);
  const part = (prefix: string) => row.querySelector(`[id="${prefix}${id}"]`);
  const sender = part("ti_f_");
  const button = row.querySelector(".Akvd4");
  return {
    threadId: id,
    sender: clean(sender?.textContent, 120),
    subject: clean(part("ti_s_")?.textContent, 240) || "(no subject)",
    snippet: clean(part("ti_b_")?.textContent, 220).replace(/^[-–—]\s*/, ""),
    date: clean(part("ti_d_")?.textContent, 24),
    unread: sender?.querySelector("b") !== null || (button?.getAttribute("aria-labelledby") ?? "").includes("tl_ul"),
    starred: checked(row.querySelector('[data-control-type^="tlastar"]')),
    selected: row.classList.contains("B7pLff") || checked(row.querySelector('[data-control-type^="tlatogglecheck"]')),
    attachment: row.querySelector('[aria-label*="ttachment" i], img[src*="paperclip" i], .M2ge3b') !== null,
    labels: [...row.querySelectorAll(".Se5Bse .q49Gcc")].map(chip => clean(chip.textContent, 40)).filter(Boolean).slice(0, 4),
  };
}

/** The list's header: title, unread count, selection count and Gmail's empty text. */
export function readList(root: Element): ListInfo {
  const doc = root.ownerDocument;
  const heading = clean(doc.querySelector("#tltbt .aLzX3d")?.textContent, 80);
  const match = /^(.*?)(\d+)?$/.exec(heading);
  const empty = root.querySelector(".mmDIjd");
  return {
    title: clean(match?.[1] ?? heading, 60),
    unread: match?.[2] ? Number(match[2]) : null,
    empty: empty && visible(empty) ? clean(empty.textContent, 200) : null,
    selected: root.querySelectorAll(`${ROW}.B7pLff`).length,
  };
}

// ---------------------------------------------------------------------------------------------
// Conversation

const MESSAGE = /^cvcmsg_[^_]+$/;

function safeLink(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    // Gmail wraps outgoing links in google.com/url?q=…; show the real destination.
    if (url.hostname.endsWith("google.com") && url.pathname === "/url") {
      const target = url.searchParams.get("q");
      if (target) return safeLink(target, base);
    }
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

const BLOCKS = new Set(["P", "DIV", "BR", "TR", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "TABLE", "HR"]);

/** Message text as runs with paragraph breaks kept; links keep a validated target. */
export function textRuns(node: Element | null, limit = 6000): { runs: TextRun[]; truncated: boolean } {
  const runs: TextRun[] = [];
  let length = 0;
  let truncated = false;
  const push = (raw: string, href?: string, bold?: boolean) => {
    if (truncated) return;
    const text = raw.replace(/[​-‏⁠﻿͏]/g, "").replace(/[ \t\r\f\v]+/g, " ");
    if (!text) return;
    const room = limit - length;
    const slice = [...text].slice(0, room).join("");
    if (slice.length < text.length) truncated = true;
    length += [...slice].length;
    const last = runs[runs.length - 1];
    if (last && !href && !last.href && !!bold === !!last.bold) last.text += slice;
    else runs.push({ text: slice, ...(href ? { href } : {}), ...(bold ? { bold: true } : {}) });
  };
  const walk = (current: Node, href?: string, bold?: boolean) => {
    if (current.nodeType === Node.TEXT_NODE) return push(current.textContent ?? "", href, bold);
    if (!(current instanceof Element)) return;
    if (current.matches("script,style,head,title,svg,button,[aria-hidden=true],.adL,.gmail_quote,blockquote.gmail_quote")) return;
    if (current instanceof HTMLElement && current.style.display === "none") return;
    // Attachments show as cards, so skip Gmail's attachment links; text beside them stays.
    if (current.matches('a[id^="att_"]')) return;
    if (current.tagName === "IMG") {
      const alt = clean(current.getAttribute("alt"), 80);
      return alt ? push(alt, href, bold) : undefined;
    }
    const link = current.tagName === "A" ? safeLink(current.getAttribute("href"), current.ownerDocument.location.href) ?? undefined : href;
    const strong = bold || current.tagName === "B" || current.tagName === "STRONG";
    if (BLOCKS.has(current.tagName)) push("\n");
    for (const child of current.childNodes) walk(child, link, strong);
    if (BLOCKS.has(current.tagName) && current.tagName !== "BR") push("\n");
  };
  walk(node ?? document.createElement("div"));
  // Collapse blank lines and trim the edges.
  for (const run of runs) run.text = run.text.replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  while (runs.length && !runs[0].text.trim()) runs.shift();
  if (runs[0]) runs[0].text = runs[0].text.replace(/^\s+/, "");
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, "");
  return { runs: runs.filter(run => run.text !== ""), truncated };
}

function readAttachments(message: Element): Attachment[] {
  // Gmail draws an image preview and a name link for the same file, so keep one link per address.
  const links = new Map<string, Element>();
  for (const link of message.querySelectorAll('a[id^="att_"]')) {
    const key = link.getAttribute("href") ?? link.id;
    if (!links.has(key)) links.set(key, link);
  }
  return [...links.values()].slice(0, 8).map(link => {
    const text = (link instanceof HTMLElement ? link.innerText : link.textContent ?? "").split("\n").map(line => clean(line, 120)).filter(Boolean);
    const name = clean(link.getAttribute("download"), 120) || text.find(line => /\.[a-z0-9]{2,5}$/i.test(line)) || text[0] || "Attachment";
    const size = text.find(line => /\d\s*(K|M|G)?B$/i.test(line)) ?? "";
    const href = viewLink(name, link);
    return { name, size, ...(href ? { href } : {}) };
  });
}

/** Files the WebView shows by itself. Anything else Gmail would download, which the app cannot do. */
const VIEWABLE = /\.(jpe?g|png|gif|webp|bmp|svg|txt|csv|mp4|webm|mp3|m4a|ogg|wav)$/i;

/**
 * Gmail's link downloads the file (`disp=attd`); `disp=inline` asks Gmail to show it instead,
 * which opens it as a web page in the same session. Only files the WebView can show get a link.
 */
function viewLink(name: string, link: Element): string | undefined {
  const href = safeLink(link.getAttribute("href"), link.ownerDocument.location.href);
  if (!href || !VIEWABLE.test(name)) return undefined;
  const url = new URL(href);
  if (url.searchParams.get("view") !== "att") return undefined;
  url.searchParams.set("disp", "inline");
  return url.href;
}

/** The "to me / 56 minutes ago" block, without the text of its "Details" button. */
function recipientText(node: Element | null): string {
  if (!node) return "";
  let text = "";
  for (const child of node.childNodes) {
    if (child instanceof HTMLBRElement) text += "\n";
    else if (child instanceof Element && child.matches('[role="button"]')) continue;
    else text += child.textContent ?? "";
  }
  return text;
}

function readMessage(message: Element, budget: number): Message {
  const id = message.id.replace(/^cvcmsg_/, "");
  const doc = message.ownerDocument;
  const sender = clean(message.querySelector(".HXJujf")?.textContent, 120);
  const recipientLines = recipientText(doc.getElementById(`cvcstrecip_${id}`)).split("\n").map(line => clean(line, 120)).filter(Boolean);
  const body = doc.getElementById(`cvcmsgbod_${id}`);
  const { runs, truncated } = body && visible(body) ? textRuns(body, budget) : { runs: [], truncated: false };
  return {
    id,
    sender: sender || "Unknown sender",
    initial: clean(message.querySelector(".th5Fjd")?.textContent, 2) || (sender[0] ?? "?").toUpperCase(),
    recipients: recipientLines[0] ?? "",
    time: recipientLines.find(line => /ago|AM|PM|\d{1,2}:\d{2}|yesterday|\b[A-Z][a-z]{2} \d{1,2}\b/i.test(line) && line !== recipientLines[0]) ?? recipientLines[1] ?? "",
    snippet: clean(doc.querySelector(`#cvcstsnip_${CSS.escape(id)} .oex1Df`)?.textContent, 200),
    body: runs,
    truncated,
    attachments: readAttachments(message),
  };
}

const COMMAND_ARGS: [ConversationCommand, string, string][] = [
  ["archive", "ca+5", "1"], ["trash", "ca+5", "9"], ["deleteForever", "ca+5", "10"], ["notSpam", "ca+5", "8"],
  ["moveToInbox", "ca+5", "2"], ["mute", "ca+5", "11"], ["markUnread", "ca+5", "4"], ["spam", "spam+8", "7"],
];

export function commandSelector(command: ConversationCommand): string {
  const [, control, arg] = COMMAND_ARGS.find(([name]) => name === command)!;
  return `#cv__cntbt [data-control-type="${control}"][data-onclick-arg="${arg}"]`;
}

export function readConversation(root: Element): Conversation {
  const doc = root.ownerDocument;
  const messages = [...root.querySelectorAll('[id^="cvcmsg_"]')].filter(element => MESSAGE.test(element.id));
  // Bodies share one budget so a long thread stays inside the page's size limit; newest messages first.
  let budget = 24_000;
  const read: Message[] = [];
  for (const message of [...messages].reverse().slice(0, 40)) {
    const next = readMessage(message, Math.max(400, Math.min(8000, budget)));
    budget -= next.body.reduce((sum, run) => sum + run.text.length, 0);
    read.unshift(next);
  }
  const star = doc.getElementById("cvcstar");
  return {
    subject: clean(root.querySelector(".jzNoVc")?.textContent, 300) || "(no subject)",
    starred: visible(star),
    labels: [...root.querySelectorAll(".Se5Bse .q49Gcc, .Bqkuxd")].map(chip => clean(chip.textContent, 40)).filter(Boolean).slice(0, 6),
    messages: read,
    commands: COMMAND_ARGS.filter(([name]) => {
      const button = doc.querySelector(commandSelector(name));
      return button !== null && visible(button.closest("[role=button], div") ?? button);
    }).map(([name]) => name),
  };
}

// ---------------------------------------------------------------------------------------------
// Compose

const value = (doc: Document, id: string) => {
  const field = doc.getElementById(id);
  return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? clean(field.value, 600) : "";
};

export function readCompose(root: Element): ComposeState {
  const doc = root.ownerDocument;
  const from = doc.getElementById("cmcfrom");
  const fromText = from instanceof HTMLSelectElement ? from.selectedOptions[0]?.textContent : from?.textContent;
  return {
    from: clean(fromText, 160),
    to: value(doc, "composeto"),
    cc: value(doc, "composecc"),
    bcc: value(doc, "composebcc"),
    subject: value(doc, "cmcsubj"),
    body: clean((doc.getElementById("cmcbody") as HTMLElement | null)?.innerText, 2000),
  };
}

// ---------------------------------------------------------------------------------------------
// Menu

export const MENU_ITEM = '[role="menuitem"][data-onclick-arg]';

export function readMenuEntry(item: Element): MenuEntry {
  const arg = item.getAttribute("data-onclick-arg") ?? "";
  const control = item.getAttribute("data-control-type") ?? item.getAttribute("data-onclick") ?? "";
  const count = clean(item.querySelector(".EAH59d")?.textContent, 8);
  const full = clean(item.textContent, 80);
  const label = clean(full.replace(count, ""), 60) || arg;
  const kind: MenuEntry["kind"] = arg.startsWith("^smartlabel") ? "category" : arg.startsWith("^") ? "system" : control.startsWith("mnpi") ? "category" : "label";
  return { arg, kind, label, count: /^\d+$/.test(count) ? Number(count) : null };
}

export const menuEmail = (root: Element) => {
  const text = clean(root.ownerDocument.querySelector('[data-control-type^="toggleaccountscallout"]')?.textContent, 200);
  return /[^\s@]+@[^\s@]+/.exec(text)?.[0]?.toLowerCase() ?? null;
};
