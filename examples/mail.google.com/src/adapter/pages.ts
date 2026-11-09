import { collection, single, type ActionSpec, type Page, type Step } from "@genesis/sdk/adapter";
import type { ConversationCommand } from "../model.ts";
import {
  account, clean, commandSelector, MENU_ITEM, menuEmail, readCompose, readConversation, readList, readMenuEntry, readThread,
  ROW, sessionIndex, threadIdOf, visibleView, type ViewId,
} from "./read.ts";

/**
 * Gmail's mobile web app is one document whose hash names the screen: `#tl/…` a list,
 * `#cv/…/<thread>` a conversation, `#co` compose, `#mn` the menu, `#pr` settings. Every hash is
 * the one page `mail`; its `view` region says which screen is showing and the foreground picks
 * the matching custom screen. `ready` waits until the view the hash names has its content.
 */

const EXPECTED: [string, ViewId][] = [["tl", "tl_"], ["cv", "cv_"], ["co", "co_"], ["mn", "mn_"], ["pr", "pr_"]];

function expectedView(hash: string): ViewId | null {
  const head = hash.replace(/^#/, "").split(/[/?]/)[0];
  if (head === "") return "tl_";
  return EXPECTED.find(([prefix]) => prefix === head)?.[1] ?? null;
}

function hasContent(doc: Document, view: ViewId): boolean {
  const root = doc.getElementById(view)!;
  switch (view) {
    case "tl_": return root.querySelector(ROW) !== null || clean(root.querySelector(".mmDIjd")?.textContent) !== "";
    case "cv_": return root.querySelector(".jzNoVc") !== null && root.querySelector('[id^="cvcmsg_"]') !== null;
    case "co_": return doc.getElementById("composeto") !== null;
    case "mn_": return root.querySelector(MENU_ITEM) !== null;
    case "pr_": return true;
  }
}

function ready(doc: Document): boolean {
  if (doc.readyState === "loading") return false;
  const shown = visibleView(doc);
  if (!shown || !hasContent(doc, shown)) return false;
  const expected = expectedView(doc.location.hash);
  // Reply and forward open compose without changing the hash; any other mismatch is a view still loading.
  return expected === null || expected === shown || shown === "co_";
}

// ---------------------------------------------------------------------------------------------
// Thread list actions

const rowSelector = (threadId: string) => `#th_${CSS.escape(threadId)}`;
const SELECT = '[data-control-type^="tlatogglecheck"]';
const STAR = '[data-control-type^="tlastar"]';
const BULK = (arg: string) => `.zY6rPd [data-control-type="ca+5"][data-onclick-arg="${arg}"]`;

function toggleIn(row: Element | null, control: string, wanted: unknown): ActionSpec {
  if (!row || typeof wanted !== "boolean") throw new Error("Expected a thread and true or false");
  const button = row.querySelector(control);
  if (!button) throw new Error("Gmail did not show this control");
  if ((button.getAttribute("aria-checked") === "true") === wanted) return { satisfied: true };
  const id = threadIdOf(row);
  return {
    steps: [{ click: `${rowSelector(id)} ${control}` }],
    until: doc => (doc.querySelector(`${rowSelector(id)} ${control}`)?.getAttribute("aria-checked") === "true") === wanted,
  };
}

const selectedRows = (doc: Document) => [...doc.querySelectorAll(`#tl_ ${ROW}`)].filter(row => readThread(row).selected);

/**
 * Archive or delete one row: select it and use Gmail's selection bar. Refuses when other rows
 * are selected, so a single-row action never takes the user's selection with it.
 */
function rowCommand(arg: string) {
  return (row: Element | null): ActionSpec => {
    if (!row) throw new Error("Expected a thread");
    const id = threadIdOf(row);
    const others = selectedRows(row.ownerDocument).filter(other => threadIdOf(other) !== id);
    if (others.length) throw new Error("Clear the selection first");
    const steps: Step[] = [];
    if (!readThread(row).selected) steps.push({ click: `${rowSelector(id)} ${SELECT}` }, { waitFor: BULK(arg), timeoutMs: 3000 });
    steps.push({ click: BULK(arg) });
    return { steps, until: doc => doc.querySelector(rowSelector(id)) === null, deadlineMs: 12_000 };
  };
}

/** Acts on every selected row with Gmail's selection bar; evidence is that the rows left. */
function bulk(arg: string) {
  return (): ActionSpec => {
    const ids = selectedRows(document).map(threadIdOf);
    if (!ids.length) throw new Error("No emails are selected");
    return {
      steps: [{ click: BULK(arg) }],
      until: doc => ids.every(id => doc.querySelector(rowSelector(id)) === null),
      deadlineMs: 12_000,
    };
  };
}

function clearSelection(): ActionSpec {
  if (!selectedRows(document).length) return { satisfied: true };
  return { steps: [{ click: '[data-control-type^="banone"]' }], until: doc => selectedRows(doc).length === 0 };
}

const rowCount = (doc: Document) => doc.querySelectorAll(`#tl_ ${ROW}`).length;

/** Scrolls to the end, where Gmail loads the next page of threads. More rows are the evidence. */
function loadMore(): ActionSpec {
  const before = rowCount(document);
  return { steps: [{ scroll: { target: "window", to: "end" } }], until: doc => rowCount(doc) > before, deadlineMs: 10_000 };
}

function refresh(): ActionSpec {
  const button = document.querySelector('#tl_ [aria-label="Refresh"], #tltbt [data-control-type^="rfr"], [aria-label="Refresh"]');
  if (!button) return { satisfied: true };
  return { steps: [{ click: '[aria-label="Refresh"]' }] };
}

// ---------------------------------------------------------------------------------------------
// Conversation actions

/** Each toolbar command leaves the conversation, except mark unread on Gmail's toolbar, which does too. */
function conversationCommand(command: ConversationCommand) {
  return (): ActionSpec => {
    const selector = commandSelector(command);
    if (!document.querySelector(selector)) throw new Error("Gmail does not offer that for this email");
    const hash = location.hash;
    return { steps: [{ click: selector }], until: doc => doc.location.hash !== hash || doc.querySelector(selector) === null, deadlineMs: 10_000 };
  };
}

/** Opens a message Gmail shows collapsed by tapping its header there. Its body appearing is the evidence. */
function expandMessage(_root: Element | null, args: { id?: unknown }): ActionSpec {
  const id = args?.id;
  if (typeof id !== "string" || !/^[\w-]+$/.test(id)) throw new Error("Expected a message id");
  const opened = (doc: Document) => {
    const body = doc.getElementById(`cvcmsgbod_${id}`);
    return body instanceof HTMLElement && body.getClientRects().length > 0 && (body.textContent ?? "").trim() !== "";
  };
  if (opened(document)) return { satisfied: true };
  const header = `[data-control-type^="cvasnip"][data-onclick-arg="${id}"]`;
  if (!document.querySelector(header)) throw new Error("Gmail can't open this message here");
  return { steps: [{ click: header }], until: opened, deadlineMs: 10_000 };
}

function setConversationStarred(_root: Element | null, args: { starred?: unknown }): ActionSpec {
  if (typeof args?.starred !== "boolean") throw new Error("Expected starred: true or false");
  const isStarred = () => {
    const star = document.getElementById("cvcstar");
    return star instanceof HTMLElement && getComputedStyle(star).display !== "none";
  };
  if (isStarred() === args.starred) return { satisfied: true };
  return {
    steps: [{ click: args.starred ? "#cvcstaroff" : "#cvcstar" }],
    until: () => isStarred() === args.starred,
  };
}

const REPLY = { reply: "cvarplf+29", replyAll: "cvarplallf+30", forward: "cvafwdf+31" } as const;

function respond(_root: Element | null, args: { mode?: unknown }): ActionSpec {
  const mode = typeof args?.mode === "string" && args.mode in REPLY ? (args.mode as keyof typeof REPLY) : "reply";
  const selector = `#cv_ [data-control-type="${REPLY[mode]}"]`;
  if (!document.querySelector(selector)) throw new Error("Gmail did not show a reply button");
  return { steps: [{ click: selector }], until: doc => visibleView(doc) === "co_" && doc.getElementById("composeto") !== null };
}

// ---------------------------------------------------------------------------------------------
// Compose actions. The applet never sends; the user sends from Gmail's own compose.

const text = (args: Record<string, unknown>, name: string) => (typeof args?.[name] === "string" ? (args[name] as string).slice(0, 2000) : null);

function fillCompose(_root: Element | null, args: Record<string, unknown>): ActionSpec {
  const steps: { fill: string; value: string }[] = [];
  for (const [name, id] of [["to", "composeto"], ["cc", "composecc"], ["bcc", "composebcc"], ["subject", "cmcsubj"]] as const) {
    const wanted = text(args, name);
    const field = document.getElementById(id);
    if (wanted !== null && field instanceof HTMLInputElement && field.value !== wanted) steps.push({ fill: `#${id}`, value: wanted });
  }
  if (!steps.length) return { satisfied: true };
  return { steps, until: doc => steps.every(step => (doc.querySelector(step.fill) as HTMLInputElement | null)?.value === step.value) };
}

function discardCompose(): ActionSpec {
  const selector = '#co_ [data-control-type="cmclose+108"], [data-control-type="cmclose+108"]';
  if (!document.querySelector(selector)) return { satisfied: true };
  return { steps: [{ click: '[data-control-type="cmclose+108"]' }], until: doc => visibleView(doc) !== "co_" };
}

// ---------------------------------------------------------------------------------------------
// Menu actions

function openMenuEntry(item: Element | null): ActionSpec {
  if (!item) throw new Error("Expected a menu item");
  const arg = item.getAttribute("data-onclick-arg") ?? "";
  const hash = location.hash;
  return {
    steps: [{ click: `#mn_ [role="menuitem"][data-onclick-arg="${CSS.escape(arg)}"]` }],
    until: doc => doc.location.hash !== hash,
  };
}

// ---------------------------------------------------------------------------------------------

export const mailPage: Page = {
  ready,
  requiresAccount: true,
  account,
  regions: {
    /** Which Gmail screen is showing, so the foreground can draw its own. */
    view: single({
      root: "#views",
      read: root => ({ view: visibleView(root.ownerDocument), hash: root.ownerDocument.location.hash.slice(0, 600), session: sessionIndex(root.ownerDocument) }),
    }),
    list: single({ root: "#tl_", dependsOn: ["#tltbt"], read: readList, actions: { clearSelection, loadMore, refresh } }),
    threads: collection({
      root: "#tl_",
      items: ROW,
      key: threadIdOf,
      entityType: "thread",
      read: readThread,
      actions: {
        setStarred: (row, args: { starred?: unknown }) => toggleIn(row, STAR, args?.starred),
        setSelected: (row, args: { selected?: unknown }) => toggleIn(row, SELECT, args?.selected),
        archive: rowCommand("1"),
        trash: rowCommand("9"),
      },
    }),
    conversation: single({
      root: "#cv_",
      key: () => location.hash.split("/").pop() ?? "conversation",
      read: readConversation,
      actions: {
        archive: conversationCommand("archive"),
        trash: conversationCommand("trash"),
        deleteForever: conversationCommand("deleteForever"),
        notSpam: conversationCommand("notSpam"),
        moveToInbox: conversationCommand("moveToInbox"),
        mute: conversationCommand("mute"),
        markUnread: conversationCommand("markUnread"),
        spam: conversationCommand("spam"),
        setStarred: setConversationStarred,
        expandMessage,
        respond,
      },
    }),
    compose: single({ root: "#co_", fields: true, read: readCompose, actions: { fill: fillCompose, discard: discardCompose } }),
    menu: collection({
      root: "#mn_",
      items: MENU_ITEM,
      key: item => item.getAttribute("data-onclick-arg") ?? clean(item.textContent, 60),
      read: readMenuEntry,
      actions: { open: openMenuEntry },
    }),
    menuAccount: single({ root: "#mn_", read: root => ({ email: menuEmail(root) }) }),
  },
  actions: {
    archiveSelected: bulk("1"),
    trashSelected: bulk("9"),
    clearSelection,
    loadMore,
    refresh,
  },
};
