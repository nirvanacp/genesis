import { useState, type ReactNode } from "react";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import {
  addDays, at, clock, dateKey, dueGroup, formatAdded, REPEAT_LABELS, startOfDay, timeKey, whenLabel,
} from "../model";
import { useAccounts, useItems, useNow, useSettings, useToast } from "../store";
import { AccountDot, Avatar, Icon, IconButton, Notice, TopBar, type IconName } from "../components/ui";
import { ItemMark } from "../components/items";
import { firstSender, pendingReply, useMailNav } from "../components/mail";

/** One reminder or to-do, with the email it came from. Param: `id`. */
export function ItemScreen() {
  const { screen, back, navigate } = useNavigation();
  const { items, loading, complete, save, remove } = useItems();
  const accounts = useAccounts();
  const { settings } = useSettings();
  const { show } = useToast();
  const mail = useMailNav();
  const now = useNow();
  const [snoozing, setSnoozing] = useState(false);
  const item = items.find(entry => entry.id === screen?.params.id);

  if (!item) return <div className="screen-frame">
    <TopBar title="Item" />
    <div className="screen">{loading ? null : <Notice title="This item is gone" icon="check2"><p>It was deleted, or removed after being done for {settings.keepDoneDays} days.</p></Notice>}</div>
  </div>;

  const account = accounts.byId(item.accountId);
  const reminder = item.type === "reminder";
  const overdue = dueGroup(item, now) === "overdue";
  const change = () => navigate({ screen: "add", params: { type: item.type, itemId: item.id } });

  const toggle = async () => {
    const before = item;
    await complete(item, !item.done);
    const repeats = !item.done && reminder && item.repeat !== "never";
    show({ text: item.done ? "Marked not done" : repeats ? "Done. Next one scheduled" : "Marked done", undo: () => void save(before) });
  };

  const snooze = async (date: Date) => {
    setSnoozing(false);
    const before = item;
    await save({ ...item, dueDate: dateKey(date), dueTime: timeKey(date), returned: false });
    show({ text: `Snoozed to ${whenLabel({ dueDate: dateKey(date), dueTime: timeKey(date) }, now)}`, undo: () => void save(before) });
  };

  const deleteItem = async () => {
    const before = item;
    back();
    await remove(item.id);
    show({ text: reminder ? "Reminder deleted" : "To-do deleted", undo: () => void save(before) });
  };

  const openEmail = (reply = false) => {
    if (!item.link?.threadId) return;
    if (reply) pendingReply.threadId = item.link.threadId;
    mail.email(item.link.threadId, item.accountId);
  };

  const today = startOfDay(now);
  const snoozeTimes = [
    { label: "In 1 hour", date: new Date(Math.ceil((now.getTime() + 3_600_000) / 300_000) * 300_000) },
    { label: `Tomorrow ${clock(settings.defaultReminderTime).replace(":00", "")}`, date: at(addDays(today, 1), settings.defaultReminderTime) },
    { label: "Next week", date: at(addDays(today, ((8 - today.getDay()) % 7) || 7), settings.defaultReminderTime) },
  ];

  return <div className="screen-frame item-screen">
    <TopBar title={<span className={`type-label ${item.type}`}><Icon name={reminder ? "bell" : "check2"} size={16} /> {reminder ? "Reminder" : "To-do"}</span>}>
      <IconButton icon="pencil" label="Edit" onClick={change} />
      <IconButton icon="trash" label="Delete" onClick={() => void deleteItem()} />
    </TopBar>
    <ScrollMemory className="screen">
      <div className="item-hero">
        <ItemMark item={item} large onToggle={() => void toggle()} />
        <h1 className={item.done ? "is-done" : undefined}>{item.title || "Untitled"}</h1>
      </div>
      <dl className="card detail-rows">
        <DetailRow icon={reminder ? "bell" : "calendar"} label="When">
          <span className={overdue ? "danger" : undefined}>{item.dueDate ? whenLabel(item, now) : "No date yet"}</span>
          <button type="button" className="link-button" onClick={change}>{item.dueDate ? "Change" : "Set date"}</button>
        </DetailRow>
        {reminder && <DetailRow icon="repeat" label="Repeat">{REPEAT_LABELS[item.repeat]}</DetailRow>}
        {reminder && item.link && <DetailRow icon="inbox" label="Bring email back">{item.bringBack ? "On" : "Off"}</DetailRow>}
        {item.priority === "high" && <DetailRow icon="flag" label="Priority">High</DetailRow>}
        <DetailRow icon="user" label="Account">{account ? <><AccountDot color={account.color} /> {account.name} <small className="muted">{account.email}</small></> : "Unknown account"}</DetailRow>
        <DetailRow icon="pencil" label="Added by you">{formatAdded(item.createdAt, now)}</DetailRow>
        {item.note && <DetailRow icon="note" label="Note"><span className="note-text">{item.note}</span></DetailRow>}
      </dl>
      {item.link && <section aria-label="From this email">
        <h2 className="section-label">From this email</h2>
        {item.link.deleted || !item.link.threadId
          ? <div className="card email-card gone"><Icon name="trash" /><span><strong>Email deleted</strong><small>{item.link.subject}</small></span></div>
          : <button type="button" className="card email-card" onClick={() => openEmail()}>
            <Avatar name={item.link.sender} size={40} />
            <span>
              <strong>{firstSender(item.link.sender)}</strong>
              <span className="email-subject">{item.link.subject}</span>
              <small>{item.link.snippet}</small>
            </span>
            <Icon name="right" />
          </button>}
        {item.link.threadId && !item.link.deleted && <p className="hint">If the email was archived, this opens it from All mail.</p>}
      </section>}
      {snoozing && <div className="chips snooze-chips" role="group" aria-label="Snooze until">
        {snoozeTimes.map(entry => <button type="button" key={entry.label} className="chip" onClick={() => void snooze(entry.date)}>{entry.label}</button>)}
        <button type="button" className="chip" onClick={change}>Pick…</button>
      </div>}
    </ScrollMemory>
    <footer className="action-bar">
      {item.link?.threadId && !item.link.deleted && <button type="button" className="secondary" onClick={() => openEmail(true)}><Icon name="reply" /> Reply</button>}
      {!item.done && <button type="button" className="secondary" aria-expanded={snoozing} onClick={() => setSnoozing(!snoozing)}><Icon name="clock" /> Snooze</button>}
      <button type="button" className={item.done ? "secondary" : "accent"} onClick={() => void toggle()}>
        <Icon name={item.done ? "back" : "check"} /> {item.done ? "Undo" : "Mark done"}
      </button>
    </footer>
  </div>;
}

function DetailRow({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return <div className="detail-row">
    <dt><Icon name={icon} size={18} /> {label}</dt>
    <dd>{children}</dd>
  </div>;
}

