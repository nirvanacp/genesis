import { memo, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type TouchEvent } from "react";
import { ScrollMemory, useAction, useNavigation, usePage, usePending, useRecord, useRegion } from "@genesis/sdk/react";
import {
  dueTag, INBOX, isBack, isDueNow, LISTS, MULTI_ACCOUNT_ENABLED, dateKey,
  type Item, type ListInfo, type MailList, type ThreadRow,
} from "../model";
import { useAccounts, useItems, useNow, useSettings, useToast } from "../store";
import { AccountDot, Avatar, Highlight, Icon, IconButton, Notice, ProgressBar, Skeleton, useSawLoading } from "../components/ui";
import { CONTEXT, linkedTo, reportCount, useCount, useMailNav, useOpenItem, type EmailSource } from "../components/mail";
import { ItemMark, ItemRow, useToggleDone } from "../components/items";
import { reducedMotion } from "../components/motion";

export function emailOf(row: ThreadRow, accountId: string): EmailSource {
  return { threadId: row.threadId, sender: row.sender, subject: row.subject, snippet: row.snippet, receivedAt: row.date, accountId };
}

/** Gmail's search operators the result chips add and remove. */
const FILTERS = [
  { id: "attachment", label: "Has attachment", term: "has:attachment" },
  { id: "unread", label: "Unread", term: "is:unread" },
  { id: "starred", label: "Starred", term: "is:starred" },
  { id: "week", label: "Last 7 days", term: "newer_than:7d" },
];

function terms(query: string): string[] {
  return query.split(/\s+/).filter(word => word && !word.includes(":"));
}

/** Inbox, categories, system lists, labels and search results: everything at `#tl/…`. */
export function ListScreen({ list }: { list: MailList }) {
  const page = usePage(CONTEXT);
  const threads = useRegion<ThreadRow>("threads", CONTEXT);
  const info = useRecord<ListInfo>("list", null, CONTEXT)?.data;
  const { items } = useItems();
  const accounts = useAccounts();
  const { settings } = useSettings();
  const nav = useMailNav();
  const now = useNow();
  const loadMore = useAction("loadMore", null, CONTEXT);
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMore, setNoMore] = useState(false);
  const account = accounts.current;
  const accountId = account?.id ?? "unknown";
  const search = list.id === "search";
  const isInbox = list.id === INBOX.id;
  const isCategory = LISTS.some(entry => entry.category && entry.id === list.id);

  useEffect(() => { if (info && !search) reportCount(list.id, info.unread ?? 0); }, [info, list.id, search]);
  useEffect(() => { setNoMore(false); }, [list.path]);

  const rows = threads.order.map(key => threads.get(key)?.data).filter((row): row is ThreadRow => !!row);
  const selected = rows.filter(row => row.selected);
  const ready = page.status === "ready" && !page.stale;
  const actionable = ready && !threads.ephemeral;
  const back = isInbox ? items.filter(item => isBack(item, now) && !item.returned) : [];
  const today = isInbox ? items.filter(item => isDueNow(item, now) && accountVisible(accounts.byId(item.accountId))) : [];

  const loading = page.status === "loading" || page.stale;
  const saw = useSawLoading(!rows.length && loading);
  const refresh = usePullToRefresh(loading);

  const more = async () => {
    setLoadingMore(true);
    const result = await loadMore(null);
    setLoadingMore(false);
    if (result.outcome !== "observed") setNoMore(true);
  };

  let body;
  if (!rows.length && loading) body = <Skeleton label={`Loading ${list.title}`} />;
  else if (!rows.length) body = <Notice title={search ? "No results" : `Nothing in ${list.title}`} icon={search ? "search" : "inbox"}>
    <p>{info?.empty ?? (search ? "Try different words or remove a filter." : "You're all caught up.")}</p>
    <div className="row-buttons"><button type="button" className="secondary" onClick={refresh.run}><Icon name="refresh" /> Refresh</button></div>
  </Notice>;
  else body = <>
    <ul className={`thread-list${saw ? " reveal" : ""}`} aria-label={list.title}>
      {rows.map(row => <ThreadItem key={row.threadId} row={row} list={list} linked={linkedTo(items, row.threadId)} account={accounts.accounts.length > 1 ? account?.color ?? null : null}
        selecting={selected.length > 0} actionable={actionable} terms={search ? terms(list.query ?? "") : []} accountId={accountId}
        swipeLeft={settings.swipeLeft} swipeRight={settings.swipeRight} />)}
    </ul>
    <div className="list-end">
      {noMore ? <p className="muted">No more emails here.</p>
        : <button type="button" className="secondary" disabled={loadingMore || !actionable} onClick={() => void more()}>
          {loadingMore ? <><span className="spinner" aria-hidden="true" /> Loading…</> : "Load older emails"}
        </button>}
      <button type="button" className="link-button" disabled={refresh.active} onClick={refresh.run}><Icon name="refresh" /> Refresh</button>
    </div>
  </>;

  return <div className="screen-frame">
    {selected.length > 0
      ? <SelectionBar rows={selected} accountId={accountId} />
      : search ? <SearchHeader query={list.query ?? ""} /> : <MailHeader title={list.title} />}
    <ProgressBar active={(loading && rows.length > 0) || loadingMore || refresh.active} />
    <ScrollMemory className="screen" aria-busy={!ready} {...refresh.handlers}>
      <PullIndicator state={refresh} />
      {isCategory && !search && <CategoryChips current={list.id} />}
      {!isInbox && !isCategory && !search && <h1 className="list-title">{list.title}</h1>}
      {search && <SearchFilters query={list.query ?? ""} count={rows.length} complete={noMore} />}
      {back.length > 0 && <BackSection items={back} />}
      {today.length > 0 && <TodayCard items={today} all={items} now={now} />}
      {search && <AlsoInTodo query={list.query ?? ""} items={items} />}
      {body}
      {page.status === "error" && rows.length > 0 && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    </ScrollMemory>
    {!selected.length && <button type="button" className="fab" onClick={() => nav.compose()} aria-label="Compose">
      <Icon name="pencil" /><span>Compose</span>
    </button>}
  </div>;
}

const accountVisible = (account: { showInTodo: boolean } | undefined) => account?.showInTodo !== false;

/** Distance (px) a pull must reach to refresh, and the most the indicator travels. */
const PULL_TRIGGER = 72;
const PULL_MAX = 112;

interface PullState {
  pull: number; active: boolean; run(): void;
  handlers: { onTouchStart(event: TouchEvent<HTMLElement>): void; onTouchMove(event: TouchEvent<HTMLElement>): void; onTouchEnd(): void; onTouchCancel(): void };
}

/**
 * Pull down at the top of the list to reload Gmail's page. The indicator follows the finger
 * with resistance, spins while Gmail redraws, and stops when the fresh page is ready.
 */
function usePullToRefresh(loading: boolean): PullState {
  const { reload } = useNavigation();
  const [pull, setPull] = useState(0);
  const [active, setActive] = useState(false);
  const origin = useRef<number | null>(null);
  const started = useRef(false);

  const run = () => {
    if (active) return;
    setActive(true);
    started.current = false;
    reload(CONTEXT);
  };
  // Done when the reload has shown as loading and then finished, or after a safety limit.
  useEffect(() => {
    if (!active) return;
    if (loading) started.current = true;
    else if (started.current) { setActive(false); return; }
    const limit = window.setTimeout(() => setActive(false), 10000);
    return () => window.clearTimeout(limit);
  }, [active, loading]);

  const handlers = {
    onTouchStart: (event: TouchEvent<HTMLElement>) => { origin.current = event.currentTarget.scrollTop <= 0 && !active ? event.touches[0]!.clientY : null; },
    onTouchMove: (event: TouchEvent<HTMLElement>) => {
      if (origin.current === null) return;
      const dy = event.touches[0]!.clientY - origin.current;
      if (dy <= 0 || event.currentTarget.scrollTop > 0) { origin.current = null; setPull(0); return; }
      setPull(Math.min(PULL_MAX, dy * 0.5));
    },
    onTouchEnd: () => {
      if (origin.current !== null && pull >= PULL_TRIGGER) run();
      origin.current = null;
      setPull(0);
    },
    onTouchCancel: () => { origin.current = null; setPull(0); },
  };
  return { pull, active, run, handlers };
}

function PullIndicator({ state }: { state: PullState }) {
  const { pull, active } = state;
  if (!pull && !active) return null;
  const y = active ? 56 : pull;
  const turn = Math.min(1, pull / PULL_TRIGGER);
  return <div className={`pull-indicator${active ? " active" : ""}${pull >= PULL_TRIGGER ? " armed" : ""}`} aria-hidden="true"
    style={{ transform: `translate(-50%, ${y}px)`, opacity: active ? 1 : turn }}>
    <span style={active ? undefined : { transform: `rotate(${turn * 270}deg)` }}><Icon name="refresh" /></span>
  </div>;
}

/** The inbox header from the mockup: menu, a search pill and the account avatar. */
function MailHeader({ title }: { title: string }) {
  const nav = useMailNav();
  const { navigate } = useNavigation();
  const { current, accounts } = useAccounts();
  return <header className="mail-header">
    <div className="search-pill">
      <IconButton icon="menu" label="Menu" onClick={() => nav.menu()} />
      <button type="button" className="search-pill-text" onClick={() => navigate({ screen: "search" })}>
        {MULTI_ACCOUNT_ENABLED && accounts.length > 1 ? "Search all inboxes" : `Search in ${title === "Primary" ? "mail" : title}`}
      </button>
      <button type="button" className="me" aria-label={`Account ${current?.email ?? ""}`} onClick={() => navigate({ screen: "accounts" })}>
        <span className="me-avatar" style={{ borderColor: current?.color ?? "var(--accent)" }}>{(current?.name ?? current?.email ?? "?").slice(0, 2).toUpperCase()}</span>
        {accounts.length > 1 && <span className="me-badge">{accounts.length}</span>}
      </button>
    </div>
  </header>;
}

function CategoryChips({ current }: { current: string }) {
  const nav = useMailNav();
  const categories = LISTS.filter(list => list.category);
  return <nav className="category-chips" aria-label="Categories">
    {categories.map(list => <CategoryChip key={list.id} id={list.id} title={list.title} current={current === list.id} onClick={() => current !== list.id && nav.list(list.path, "replace")} />)}
  </nav>;
}

function CategoryChip({ id, title, current, onClick }: { id: string; title: string; current: boolean; onClick(): void }) {
  const count = useCount(id);
  return <button type="button" className="category-chip" aria-current={current ? "page" : undefined} onClick={onClick}>
    {title}{count ? <span className="count">{count}</span> : null}
  </button>;
}

/** Share of the row width a swipe must pass to act. */
const SWIPE_TRIGGER = 0.3;

/** Thread row: avatar toggles selection, the row opens the email, swipes remind or archive. */
const ThreadItem = memo(function ThreadItem({ row, list, linked, account, selecting, actionable, terms: words, accountId, swipeLeft, swipeRight }: {
  row: ThreadRow; list: MailList; linked: Item[]; account: string | null; selecting: boolean; actionable: boolean; terms: string[]; accountId: string;
  swipeLeft: string; swipeRight: string;
}) {
  const nav = useMailNav();
  const { navigate } = useNavigation();
  const { show } = useToast();
  const setStarred = useAction<{ starred: boolean }>("setStarred", "threads", CONTEXT);
  const setSelected = useAction<{ selected: boolean }>("setSelected", "threads", CONTEXT);
  const archive = useAction("archive", "threads", CONTEXT);
  // Star and selection show the requested state while Gmail applies it.
  const pending = usePending("threads", row.threadId, CONTEXT);
  const want = <T,>(name: string, field: string, current: T): T => {
    const last = [...pending].reverse().find(action => action.name === name);
    return last ? (last.args as Record<string, T>)[field] ?? current : current;
  };
  const starred = want("setStarred", "starred", row.starred);
  const selected = want("setSelected", "selected", row.selected);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; swiping: boolean } | null>(null);
  const element = useRef<HTMLLIElement>(null);
  const open = linked.filter(item => !item.done && !item.snooze);
  const snoozed = linked.find(item => item.snooze && !item.done);

  // An archived row slides off the side it was swiped to and closes the gap, then Gmail removes
  // it. If Gmail refuses, the row comes back.
  const act = (kind: string, direction = -1) => {
    if (kind === "archive") {
      const node = element.current;
      const width = node?.offsetWidth ?? 360;
      const still = reducedMotion() || !node;
      setOffset(direction * width);
      const collapse = still ? null : node.animate([{ height: `${node.offsetHeight}px` }, { height: "0px" }],
        { duration: 220, delay: 180, easing: "cubic-bezier(.2, 0, 0, 1)", fill: "forwards" });
      void archive(row.threadId).then(result => {
        if (result.outcome === "observed") { show({ text: "Archived" }); return; }
        collapse?.cancel();
        setOffset(0);
        show({ text: "Couldn't archive. Try again." });
      });
    } else if (kind === "remind") {
      navigate({ screen: "add", params: { type: "reminder", emails: JSON.stringify([emailOf(row, accountId)]), archive: "row" } });
    }
  };

  const down = (event: ReactPointerEvent) => {
    if (!actionable || selecting || event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, swiping: false };
  };
  const move = (event: ReactPointerEvent) => {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (!origin.swiping) {
      if (Math.abs(dy) > 12) { start.current = null; return; }
      if (Math.abs(dx) < 14) return;
      origin.swiping = true;
      setDragging(true);
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    const allowed = (dx > 0 && swipeRight !== "none") || (dx < 0 && swipeLeft !== "none");
    setOffset(allowed ? dx : 0);
  };
  const up = () => {
    const origin = start.current;
    start.current = null;
    if (!origin?.swiping) return;
    setDragging(false);
    const width = element.current?.offsetWidth ?? 360;
    const moved = offset;
    const kind = moved > 0 ? swipeRight : swipeLeft;
    if (Math.abs(moved) > width * SWIPE_TRIGGER && kind === "archive") { act(kind, Math.sign(moved)); return; }
    setOffset(0);
    if (Math.abs(moved) > width * SWIPE_TRIGGER) act(kind);
  };

  const label = `${row.unread ? "Unread. " : ""}${row.sender}. ${row.subject}. ${row.date}`;
  const swipeKind = offset > 0 ? swipeRight : offset < 0 ? swipeLeft : "";
  const armed = Math.abs(offset) > (element.current?.offsetWidth ?? 360) * SWIPE_TRIGGER;
  return <li ref={element} className={`thread ${row.unread ? "unread" : ""} ${selected ? "selected" : ""}`}>
    {offset !== 0 && <div className={`swipe-under ${offset > 0 ? "right" : "left"} ${swipeKind}${armed ? " armed" : ""}`} aria-hidden="true">
      <Icon name={swipeKind === "archive" ? "archive" : "bell"} /><span>{swipeKind === "archive" ? "Archive" : "Remind"}</span>
    </div>}
    <div className={`thread-inner${dragging ? " dragging" : ""}`} style={offset ? { transform: `translateX(${offset}px)` } : undefined}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDragging(false); setOffset(0); }}>
      <button type="button" className="avatar-button" aria-label={selected ? `Deselect ${row.subject}` : `Select ${row.subject}`}
        aria-pressed={selected} disabled={!actionable} onClick={() => void setSelected(row.threadId, { selected: !selected })}>
        <Avatar name={row.sender} selected={selected} />
      </button>
      <button type="button" className="thread-main" aria-label={label}
        onClick={() => selecting ? void setSelected(row.threadId, { selected: !selected }) : nav.thread(row.threadId, list.path)}>
        <span className="thread-line">
          {account && <AccountDot color={account} />}
          <span className="sender">{row.sender}</span>
          <span className="date">{row.date}</span>
        </span>
        <span className="subject"><Highlight text={row.subject} terms={words} /></span>
        <span className="snippet"><Highlight text={row.snippet} terms={words} /></span>
        {(open.length > 0 || snoozed || row.attachment || row.labels.length > 0) && <span className="thread-chips">
          {open.map(item => <span key={item.id} className={`chip-small ${item.type}`}>
            {item.type === "todo" ? <><Icon name="check" size={12} /> To-do added</> : <><Icon name="bell" size={12} /> {item.dueDate ? dueTag(item) : "Reminder"}</>}
          </span>).slice(0, 2)}
          {snoozed && <span className="chip-small"><Icon name="clock" size={12} /> {dueTag(snoozed)}</span>}
          {row.attachment && <span className="chip-small attachment"><Icon name="clip" size={12} /> Attachment</span>}
          {row.labels.filter(labelText => labelText !== "Inbox" || words.length > 0).slice(0, 2).map(labelText => <span key={labelText} className="chip-small label">{labelText}</span>)}
        </span>}
      </button>
      <IconButton icon="star" label={starred ? "Unstar" : "Star"} filled={starred} pressed={starred} className={starred ? "star on" : "star"}
        disabled={!actionable} onClick={() => void setStarred(row.threadId, { starred: !starred })} />
    </div>
  </li>;
});

/** The bulk bar from the mockup: count, archive, delete and "save for later". */
function SelectionBar({ rows, accountId }: { rows: ThreadRow[]; accountId: string }) {
  const clear = useAction("clearSelection", null, CONTEXT);
  const archive = useAction("archiveSelected", null, CONTEXT);
  const trash = useAction("trashSelected", null, CONTEXT);
  const { navigate } = useNavigation();
  const { show } = useToast();
  const run = (action: typeof archive, done: string) => void action(null).then(result => show({ text: result.outcome === "observed" ? done : result.message ?? "Couldn't finish. Try again." }));
  return <header className="selection-bar">
    <IconButton icon="close" label="Clear selection" onClick={() => void clear(null)} />
    <h1>{rows.length} selected</h1>
    <span className="spacer" />
    <IconButton icon="archive" label="Archive selected" onClick={() => run(archive, `${rows.length} archived`)} />
    <IconButton icon="trash" label="Delete selected" onClick={() => run(trash, `${rows.length} moved to Trash`)} />
    <IconButton icon="bell" label="Save for later" onClick={() => navigate({ screen: "bulk", params: { emails: JSON.stringify(rows.map(row => emailOf(row, accountId))) } })} />
  </header>;
}

function SearchHeader({ query }: { query: string }) {
  const { navigate, back } = useNavigation();
  return <header className="mail-header">
    <div className="search-pill">
      <IconButton icon="back" label="Back" onClick={back} />
      <button type="button" className="search-pill-text filled" onClick={() => navigate({ screen: "search", params: { q: query } })}>{query}</button>
      <IconButton icon="close" label="Clear search" onClick={() => navigate({ screen: "search", params: { q: "" } })} />
    </div>
  </header>;
}

function SearchFilters({ query, count, complete }: { query: string; count: number; complete: boolean }) {
  const nav = useMailNav();
  const words = query.split(/\s+/).filter(Boolean);
  const toggle = (term: string) => {
    const next = words.includes(term) ? words.filter(word => word !== term) : [...words, term];
    if (next.length) nav.search(next.join(" "), "replace");
  };
  const plain = terms(query).join(" ");
  const active = FILTERS.filter(filter => words.includes(filter.term));
  return <>
    <nav className="filter-chips" aria-label="Filters">
      {FILTERS.map(filter => <button type="button" key={filter.id} className="filter-chip" aria-pressed={words.includes(filter.term)} onClick={() => toggle(filter.term)}>
        {words.includes(filter.term) && <Icon name="check" size={14} />}{filter.label}
      </button>)}
    </nav>
    <p className="results-line">
      <strong>{count}{complete ? "" : count ? "+" : ""} results</strong>
      {plain ? ` for “${plain}”` : ""}{active.length ? ` · ${active.map(filter => filter.label.toLowerCase()).join(", ")}` : ""}
      <span className="muted"> · Most recent</span>
    </p>
  </>;
}

function AlsoInTodo({ query, items }: { query: string; items: Item[] }) {
  const openItem = useOpenItem();
  const now = useNow();
  const words = terms(query).map(word => word.toLowerCase());
  const matches = words.length ? items.filter(item => !item.snooze && words.every(word =>
    `${item.title} ${item.note} ${item.link?.subject ?? ""} ${item.link?.sender ?? ""}`.toLowerCase().includes(word))).slice(0, 4) : [];
  if (!matches.length) return null;
  return <section className="also">
    <h2 className="section-label">Also in your to-do</h2>
    <ul className="item-list card">{matches.map(item => <ItemRow key={item.id} item={item} now={now} onOpen={() => openItem(item.id)} />)}</ul>
  </section>;
}

/** Reminders that bring their email back, and snoozes that are due: shown first in the inbox. */
function BackSection({ items }: { items: Item[] }) {
  const nav = useMailNav();
  const { save, complete } = useItems();
  const { show } = useToast();
  const dismiss = (item: Item) => {
    const done = item.snooze ? complete(item, true) : save({ ...item, returned: true });
    void done.then(() => show({ text: "Dismissed", undo: () => void save(item) }), () => show({ text: "Couldn't save. Try again." }));
  };
  return <section className="back-section" aria-label="Back in your inbox">
    <h2 className="section-label"><Icon name="bell" size={14} /> Back in your inbox</h2>
    <ul className="back-list">
      {items.slice(0, 5).map(item => <li key={item.id} className="back-row">
        <button type="button" className="back-main" onClick={() => { void save({ ...item, returned: true }); if (item.link?.threadId) nav.thread(item.link.threadId); }}>
          <strong>{item.link?.subject ?? item.title}</strong>
          <span>{item.snooze ? "Snoozed" : item.title} · {item.link?.sender}</span>
        </button>
        <IconButton icon="check" label={`Dismiss ${item.title}`} onClick={() => dismiss(item)} />
      </li>)}
    </ul>
  </section>;
}

/** The blue Today card: what is due today and overdue, with progress for the day. */
function TodayCard({ items, all, now }: { items: Item[]; all: Item[]; now: Date }) {
  const { navigate } = useNavigation();
  const todos = items.filter(item => item.type === "todo").length;
  const reminders = items.length - todos;
  const doneToday = all.filter(item => item.done && item.completedAt && dateKey(new Date(item.completedAt)) === dateKey(now)).length;
  const progress = doneToday / (doneToday + items.length);
  const shown = [...items].sort((a, b) => (a.dueTime ?? "").localeCompare(b.dueTime ?? "")).slice(0, 2);
  return <section className="today-card">
    <button type="button" className="today-head" onClick={() => navigate({ screen: "todo", mode: "root" })}>
      <span><strong>Today</strong> <span className="muted">{[todos && `${todos} to-do${todos > 1 ? "s" : ""}`, reminders && `${reminders} reminder${reminders > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</span></span>
      <Icon name="right" />
    </button>
    <ul>
      {shown.map(item => <TodayRow key={item.id} item={item} now={now} />)}
    </ul>
    <div className="progress" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
      <span style={{ width: `${Math.round(progress * 100)}%` }} />
    </div>
  </section>;
}


function TodayRow({ item, now }: { item: Item; now: Date }) {
  const { navigate } = useNavigation();
  const { checking, toggle } = useToggleDone(item);
  return <li className={`today-row${checking ? " is-done" : ""}`}>
    <ItemMark item={item} onToggle={toggle} checking={checking} />
    <button type="button" className="today-title" onClick={() => navigate({ screen: "item", params: { id: item.id } })}>{item.title}</button>
    <span className={`tag ${item.type === "reminder" ? "reminder" : "due"}`}>{item.dueTime ? dueTag(item, now).replace(/^Today /, "by ") : dueTag(item, now)}</span>
  </li>;
}
