import { useState, type ReactNode } from "react";
import { clock, dueGroup, dueMoment, dueTag, formatAdded, timeKey, type Account, type Item } from "../model";
import { useAccounts, useItems, useToast } from "../store";
import { AccountDot, Icon } from "./ui";
import { firstSender } from "./mail";
import { reducedMotion } from "./motion";

/** How long the check shows on a row before the item moves to Done. */
const CHECK_MS = 380;

/**
 * Marking done from a list: the check fills at once, the row stays a moment so the person sees
 * it land, then the item is saved as done and a toast offers Undo. Marking not done is immediate.
 */
export function useToggleDone(item: Item): { checking: boolean; toggle(): void } {
  const { complete } = useItems();
  const { show } = useToast();
  const [checking, setChecking] = useState(false);
  const toggle = () => {
    if (checking) return;
    if (item.done) { void complete(item, false); return; }
    setChecking(true);
    window.setTimeout(() => {
      void complete(item, true).then(
        () => show({ text: item.type === "reminder" ? "Reminder done" : "To-do done", undo: () => complete(item, false) }),
        () => show({ text: "Couldn't save. Try again." }),
      ).finally(() => setChecking(false));
    }, reducedMotion() ? 0 : CHECK_MS);
  };
  return { checking, toggle };
}

/** The round bell marker of a reminder or the square checkbox of a to-do; both complete the item. */
export function ItemMark({ item, onToggle, large = false, checking = false }: { item: Item; onToggle(): void; large?: boolean; checking?: boolean }) {
  const done = item.done || checking;
  const label = item.done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`;
  return <button type="button" className={`mark ${item.type} ${done ? "done" : ""} ${checking ? "checking" : ""} ${large ? "large" : ""}`}
    role="checkbox" aria-checked={done} aria-label={label} onClick={event => { event.stopPropagation(); onToggle(); }}>
    {done ? <Icon name="check" /> : item.type === "reminder" ? <Icon name="bell" /> : null}
  </button>;
}

export function accountOf(accounts: { byId(id: string): Account | undefined }, item: Item) {
  return accounts.byId(item.accountId);
}

/**
 * One reminder or to-do. `mode` picks the second line: "due" shows when it's due and the account,
 * "added" shows the email it came from and when it was saved, as the two To-do views do.
 */
export function ItemRow({ item, mode = "due", now, onOpen, trailing, onSetDate }: {
  item: Item; mode?: "due" | "added"; now: Date; onOpen(): void; trailing?: ReactNode; onSetDate?: () => void;
}) {
  const { checking, toggle } = useToggleDone(item);
  const accounts = useAccounts();
  const account = accountOf(accounts, item);
  const group = dueGroup(item, now);
  const overdue = group === "overdue";
  const due = dueMoment(item);
  let meta: ReactNode;
  if (mode === "added") {
    meta = <>{item.link ? <><Icon name="mail" size={14} /> {firstSender(item.link.sender)} · </> : "Added by you · "}
      {item.done && item.completedAt ? `Done ${formatAdded(item.completedAt, now)}` : clock(timeKey(new Date(item.createdAt)))}</>;
  } else {
    const when = overdue ? (item.dueTime ? `Due ${dueTag(item, now)}` : dueTag(item, now))
      : group === "today" && !item.dueTime ? "Anytime today" : group === "none" ? "No date yet" : item.dueTime && group === "today" ? "Today" : dueTag(item, now);
    meta = <>{when}{account && <> · <AccountDot color={account.color} /> {account.name}</>}</>;
  }
  let tag: ReactNode = trailing;
  if (tag === undefined) {
    if (mode === "added" && !item.dueDate && !item.done) {
      tag = <button type="button" className="tag set-date" onClick={event => { event.stopPropagation(); (onSetDate ?? onOpen)(); }}>+ Set date</button>;
    } else if (mode === "added" && item.dueDate && !item.done) {
      tag = <span className={`tag ${item.type === "reminder" ? "reminder" : ""}`}>{dueTag(item, now)}</span>;
    } else if (mode === "due" && item.dueTime && !item.done && due) {
      tag = <span className="time-tag">{clock(item.dueTime)}</span>;
    }
  }
  return <li className={`item-row ${overdue && mode === "due" ? "overdue" : ""} ${item.done || checking ? "is-done" : ""} ${item.type}`}>
    <ItemMark item={item} onToggle={toggle} checking={checking} />
    <button type="button" className="item-main" onClick={onOpen}>
      <span className="item-title">
        {item.priority === "high" && !item.done && <span className="priority" aria-label="High priority"><Icon name="flag" filled size={14} /></span>}
        {item.title || "Untitled"}
      </span>
      <span className="item-meta">{meta}</span>
    </button>
    {tag}
  </li>;
}
