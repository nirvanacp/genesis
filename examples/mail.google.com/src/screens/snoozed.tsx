import { ScrollMemory } from "@genesis/sdk/react";
import { byDue, dateKey, timeKey, whenLabel, type Item } from "../model";
import { useItems, useNow, useToast } from "../store";
import { Avatar, Icon, IconButton, Notice, TopBar } from "../components/ui";
import { firstSender, useMailNav } from "../components/mail";

/** Emails snoozed in Gmail Only, with when each comes back. */
export function SnoozedScreen() {
  const { items, save, complete } = useItems();
  const { show } = useToast();
  const nav = useMailNav();
  const now = useNow();
  const snoozed = items.filter(item => item.snooze && !item.done).sort(byDue);

  const backNow = async (item: Item) => {
    await save({ ...item, dueDate: dateKey(now), dueTime: timeKey(now), returned: false });
    show({ text: "Back in your inbox", undo: () => save(item) });
  };
  const cancel = async (item: Item) => {
    await complete(item, true);
    show({ text: "Snooze removed. The email stays in All mail.", undo: () => save(item) });
  };

  return <div className="screen-frame">
    <TopBar title="Snoozed" />
    <ScrollMemory className="screen">
      {!snoozed.length ? <Notice title="Nothing snoozed" icon="clock"><p>Snooze an email from its toolbar to hide it until later.</p></Notice>
        : <ul className="plain-list card">
          {snoozed.map(item => <li key={item.id} className="snooze-row">
            <button type="button" className="list-button" onClick={() => item.link?.threadId && nav.email(item.link.threadId, item.accountId)}>
              <Avatar name={item.link?.sender ?? item.title} size={36} />
              <span>
                <strong>{item.link?.subject ?? item.title}</strong>
                <small>{firstSender(item.link?.sender ?? "")} · <Icon name="clock" size={12} /> {whenLabel(item, now)}</small>
              </span>
            </button>
            <IconButton icon="inbox" label="Bring back now" onClick={() => void backNow(item)} />
            <IconButton icon="close" label="Remove snooze" onClick={() => void cancel(item)} />
          </li>)}
        </ul>}
    </ScrollMemory>
  </div>;
}
