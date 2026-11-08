import { useMemo, useState } from "react";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import {
  addDays, byDue, dateKey, dayOffset, dueGroup, longDay, MULTI_ACCOUNT_ENABLED, parseDate, startOfDay, weekday,
  type DueGroup, type Item, type SortMode,
} from "../model";
import { useAccounts, useItems, useNow, useSettings, useToast } from "../store";
import { AccountDot, Chips, Highlight, Icon, IconButton, Notice, Skeleton } from "../components/ui";
import { ItemRow } from "../components/items";
import { useOpenItem } from "../components/mail";

const GROUP_TITLES: Record<DueGroup, string> = {
  overdue: "Overdue", today: "Today", tomorrow: "Tomorrow", week: "This week", later: "Later", none: "No date yet", done: "Done",
};
const DUE_ORDER: DueGroup[] = ["overdue", "today", "tomorrow", "week", "later", "none", "done"];

type Filter = "all" | "reminder" | "todo" | "done";

/**
 * The To-do tab. "When it's due" groups open items by their date under a week strip; "When I
 * added it" groups them by the day they were saved, with type filters. Snoozed emails are kept
 * out: they live in the drawer's Snoozed list.
 */
export function TodoScreen() {
  const { items, loading, error, saveMany } = useItems();
  const accounts = useAccounts();
  const { settings, update } = useSettings();
  const { navigate } = useNavigation();
  const { show } = useToast();
  const openItem = useOpenItem();
  const now = useNow();
  const [sort, setSort] = useState<SortMode>(settings.defaultSort);
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState<string | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);
  const accountFilter = settings.todoAccount;

  const visible = useMemo(() => {
    const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(item => !item.snooze)
      .filter(item => accountFilter === "all" || item.accountId === accountFilter)
      .filter(item => accounts.byId(item.accountId)?.showInTodo !== false || accountFilter === item.accountId)
      .filter(item => !words.length || words.every(word => searchText(item).includes(word)));
  }, [items, accountFilter, accounts, query]);

  const today = dateKey(now);
  const overdue = visible.filter(item => dueGroup(item, now) === "overdue");
  const moveAllToToday = async () => {
    const moved = overdue.map(item => ({ ...item, dueDate: today }));
    try {
      await saveMany(moved);
      show({ text: `${moved.length} moved to today`, undo: () => void saveMany(overdue) });
    } catch {
      show({ text: "Couldn't move them. Try again." });
    }
  };

  const addManual = () => navigate({ screen: "add", params: { type: "todo" } });
  const account = accountFilter === "all" ? null : accounts.byId(accountFilter);
  const showAccountFilter = MULTI_ACCOUNT_ENABLED || accounts.accounts.length > 1;

  let body;
  if (loading && !items.length) body = <Skeleton label="Loading your to-dos" kind="text" rows={6} />;
  else if (error && !items.length) body = <Notice title="Couldn't load your to-dos" role="alert" icon="alert"><p>Try closing and reopening Gmail Only.</p></Notice>;
  else if (!visible.length) body = query
    ? <Notice title="No matches" icon="search"><p>Nothing in your to-dos matches “{query}”.</p></Notice>
    : <Notice title="Nothing due" icon="check2">
      <p>Save emails as reminders from any message. Open an email and tap <strong>Add to…</strong>, or swipe it right.</p>
      <button type="button" className="secondary" onClick={addManual}><Icon name="plus" /> Add a to-do</button>
    </Notice>;
  else if (sort === "due") body = <DueView items={visible} now={now} day={day} keepDays={settings.keepDoneDays} terms={query ? query.split(/\s+/) : []}
    onOpen={openItem} onMoveAll={() => void moveAllToToday()} />;
  else body = <AddedView items={visible} now={now} filter={filter} onFilter={setFilter} terms={query ? query.split(/\s+/) : []} onOpen={openItem}
    onSetDate={item => navigate({ screen: "add", params: { type: item.type, itemId: item.id } })} />;

  return <div className="screen-frame todo">
    <header className="todo-header">
      {query === null ? <>
        <h1>To-do</h1>
        <span className="spacer" />
        {showAccountFilter && <button type="button" className="account-filter" aria-expanded={accountMenu} onClick={() => setAccountMenu(!accountMenu)}>
          {account ? <><AccountDot color={account.color} /> {account.name}</> : "All accounts"} <Icon name="down" size={16} />
        </button>}
        <IconButton icon="search" label="Search to-dos" onClick={() => setQuery("")} />
      </> : <div className="search-pill todo-search">
        <Icon name="search" />
        <input type="search" autoFocus placeholder="Search to-dos" aria-label="Search to-dos" value={query} onChange={event => setQuery(event.target.value)} />
        <IconButton icon="close" label="Close search" onClick={() => setQuery(null)} />
      </div>}
    </header>
    {accountMenu && <div className="popover account-menu" role="menu">
      <button type="button" role="menuitemradio" aria-checked={accountFilter === "all"} onClick={() => { void update({ todoAccount: "all" }); setAccountMenu(false); }}>All accounts</button>
      {accounts.accounts.map(entry => <button type="button" role="menuitemradio" key={entry.id} aria-checked={accountFilter === entry.id}
        onClick={() => { void update({ todoAccount: entry.id }); setAccountMenu(false); }}>
        <AccountDot color={entry.color} /> {entry.name} <small>{entry.email}</small>
      </button>)}
    </div>}
    <ScrollMemory className="screen" aria-busy={loading}>
      <div className="segmented" role="tablist" aria-label="Sort">
        {(["due", "added"] as const).map(mode => <button key={mode} type="button" role="tab" aria-selected={sort === mode} onClick={() => setSort(mode)}>
          {mode === "due" ? "When it's due" : "When I added it"}
        </button>)}
      </div>
      {sort === "due" && <WeekStrip items={visible} now={now} day={day} onDay={setDay} />}
      {body}
    </ScrollMemory>
    <button type="button" className="fab round" aria-label="Add a to-do" onClick={addManual}><Icon name="plus" /></button>
  </div>;
}

const searchText = (item: Item) => `${item.title} ${item.note} ${item.link?.subject ?? ""} ${item.link?.sender ?? ""}`.toLowerCase();

/** Seven days from today; each shows a dot for open items due then. Tapping one shows only that day. */
function WeekStrip({ items, now, day, onDay }: { items: Item[]; now: Date; day: string | null; onDay(day: string | null): void }) {
  const start = startOfDay(now);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const due = new Set(items.filter(item => !item.done && item.dueDate).map(item => item.dueDate));
  return <div className="week-strip" role="group" aria-label="This week">
    {days.map(date => {
      const key = dateKey(date);
      const selected = day === key;
      const count = items.filter(item => !item.done && item.dueDate === key).length;
      return <button key={key} type="button" aria-pressed={selected} className={`week-day ${dayOffset(date, now) === 0 ? "today" : ""}`}
        aria-label={`${longDay(date)}${count ? `, ${count} due` : ""}`} onClick={() => onDay(selected ? null : key)}>
        <span>{weekday(date).slice(0, 1)}</span>
        <strong>{date.getDate()}</strong>
        <i className={due.has(key) ? "dot" : "dot none"} aria-hidden="true" />
      </button>;
    })}
  </div>;
}

function DueView({ items, now, day, terms, keepDays, onOpen, onMoveAll }: {
  items: Item[]; now: Date; day: string | null; terms: string[]; keepDays: number; onOpen(id: string): void; onMoveAll(): void;
}) {
  if (day) {
    const list = items.filter(item => item.dueDate === day && !item.done).sort(byDue);
    const date = parseDate(day);
    return <section className="group">
      <h2 className="group-head"><span>{longDay(date)}</span><small>{list.length ? `${list.length} due` : "Nothing due"}</small></h2>
      {list.length > 0 && <ul className="item-list card">{list.map(item => <Row key={item.id} item={item} now={now} terms={terms} onOpen={onOpen} />)}</ul>}
    </section>;
  }
  const groups = new Map<DueGroup, Item[]>();
  for (const item of items) {
    const group = dueGroup(item, now);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return <>{DUE_ORDER.filter(group => groups.get(group)?.length).map(group => {
    const list = groups.get(group)!.sort(group === "done" ? (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0) : byDue);
    let note: string | null = null;
    if (group === "today") note = `${list.length} left`;
    else if (group === "none") note = `${list.length} to schedule`;
    else if (group === "done") note = `Kept for ${keepDays} days`;
    return <section key={group} className={`group ${group}`}>
      <h2 className="group-head">
        <span>{GROUP_TITLES[group]}</span>
        {group === "overdue" ? <button type="button" className="link-button" onClick={onMoveAll}>Move all to today</button> : note && <small>{note}</small>}
      </h2>
      <ul className="item-list card">{list.map(item => <Row key={item.id} item={item} now={now} terms={terms} onOpen={onOpen} />)}</ul>
    </section>;
  })}</>;
}

function AddedView({ items, now, filter, onFilter, terms, onOpen, onSetDate }: {
  items: Item[]; now: Date; filter: Filter; onFilter(filter: Filter): void; terms: string[]; onOpen(id: string): void; onSetDate(item: Item): void;
}) {
  const counts: Record<Filter, number> = {
    all: items.filter(item => !item.done).length,
    reminder: items.filter(item => !item.done && item.type === "reminder").length,
    todo: items.filter(item => !item.done && item.type === "todo").length,
    done: items.filter(item => item.done).length,
  };
  const shown = items.filter(item => filter === "all" ? true : filter === "done" ? item.done : item.type === filter && !item.done)
    .sort((a, b) => b.createdAt - a.createdAt);
  const days = new Map<string, Item[]>();
  for (const item of shown) {
    const key = dateKey(new Date(item.createdAt));
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  const label = (key: string) => {
    const offset = dayOffset(parseDate(key), now);
    return offset === 0 ? "Today" : offset === -1 ? "Yesterday" : longDay(parseDate(key));
  };
  return <>
    <Chips<Filter> label="Show" value={filter} onChange={onFilter} className="filters" options={[
      { id: "all", label: <>All <span className="count">{counts.all}</span></> },
      { id: "reminder", label: <><Icon name="bell" size={14} /> Reminders <span className="count">{counts.reminder}</span></> },
      { id: "todo", label: <><Icon name="check2" size={14} /> To-dos <span className="count">{counts.todo}</span></> },
      { id: "done", label: <>Done <span className="count">{counts.done}</span></> },
    ]} />
    {!shown.length && <p className="muted padded">Nothing here.</p>}
    {[...days].map(([key, list]) => <section key={key} className="group">
      <h2 className="group-head"><span>{label(key)}</span><small>{list.length} added</small></h2>
      <ul className="item-list card">{list.map(item => <Row key={item.id} item={item} now={now} terms={terms} onOpen={onOpen} mode="added" onSetDate={() => onSetDate(item)} />)}</ul>
    </section>)}
  </>;
}

function Row({ item, now, terms, onOpen, mode = "due", onSetDate }: {
  item: Item; now: Date; terms: string[]; onOpen(id: string): void; mode?: "due" | "added"; onSetDate?: () => void;
}) {
  return <ItemRow item={item} now={now} mode={mode} onOpen={() => onOpen(item.id)} onSetDate={onSetDate}
    trailing={terms.length && item.link ? <span className="match"><Highlight text={item.link.subject} terms={terms} /></span> : undefined} />;
}
