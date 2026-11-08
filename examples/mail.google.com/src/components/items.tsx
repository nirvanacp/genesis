import type { ReactNode } from "react";
import { clock, dueGroup, dueMoment, dueTag, formatAdded, timeKey, type Account, type Item } from "../model";
import { useAccounts, useItems } from "../store";
import { AccountDot, Icon } from "./ui";
import { firstSender } from "./mail";

/** The round bell marker of a reminder or the square checkbox of a to-do; both complete the item. */
export function ItemMark({ item, onToggle, large = false }: { item: Item; onToggle(): void; large?: boolean }) {
  const label = item.done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`;
  return <button type="button" className={`mark ${item.type} ${item.done ? "done" : ""} ${large ? "large" : ""}`}
    role="checkbox" aria-checked={item.done} aria-label={label} onClick={event => { event.stopPropagation(); onToggle(); }}>
    {item.done ? <Icon name="check" /> : item.type === "reminder" ? <Icon name="bell" /> : null}
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
  const { complete } = useItems();
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
  return <li className={`item-row ${overdue && mode === "due" ? "overdue" : ""} ${item.done ? "is-done" : ""} ${item.type}`}>
    <ItemMark item={item} onToggle={() => void complete(item, !item.done)} />
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
