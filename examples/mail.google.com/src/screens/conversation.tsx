import { useEffect, useState } from "react";
import { ScrollMemory, useAction, useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import {
  dateKey, quickPresets, timeKey, whenLabel,
  type Conversation, type ConversationCommand, type MailList, type Message, type TextRun,
} from "../model";
import { useAccounts, useItems, useNow, useSettings, useToast } from "../store";
import { AccountDot, Avatar, Icon, IconButton, Notice, Popover, Skeleton } from "../components/ui";
import { CONTEXT, linkedTo, newItem, pendingReply, suggestTitle, useOpenItem, type EmailSource } from "../components/mail";
import { ItemRow } from "../components/items";

const COMMAND_LABELS: Record<ConversationCommand, string> = {
  archive: "Archive", trash: "Delete", deleteForever: "Delete forever", notSpam: "Not spam", moveToInbox: "Move to inbox",
  mute: "Mute", markUnread: "Mark unread", spam: "Report spam",
};
const DONE_TEXT: Partial<Record<ConversationCommand, string>> = {
  archive: "Archived", trash: "Moved to Trash", deleteForever: "Deleted forever", notSpam: "Moved to inbox",
  moveToInbox: "Moved to inbox", mute: "Muted", markUnread: "Marked unread", spam: "Reported as spam",
};

/** An open email: the toolbar, the "Add to…" pill, the messages and the reply buttons. */
export function ConversationScreen({ threadId, list }: { threadId: string; list: MailList }) {
  const page = usePage(CONTEXT);
  const record = useRecord<Conversation>("conversation", null, CONTEXT);
  const conversation = record?.data;
  const { items } = useItems();
  const { settings } = useSettings();
  const accounts = useAccounts();
  const { back, navigate } = useNavigation();
  const { show } = useToast();
  const openItem = useOpenItem();
  const now = useNow();
  const [menu, setMenu] = useState<"add" | "more" | null>(null);
  const ready = page.status === "ready" && !page.stale && conversation !== undefined;
  const linked = linkedTo(items, threadId).filter(item => !item.snooze || !item.done);
  const account = accounts.current;

  // Opening a snoozed email that is back clears it from "Back in your inbox".
  const { save } = useItems();
  useEffect(() => {
    for (const item of linked) if (item.bringBack && !item.returned && item.dueDate && new Date(`${item.dueDate}T${item.dueTime ?? "00:00"}`) <= now) void save({ ...item, returned: true });
  }, [linked.length]);

  const actions = {
    archive: useAction("archive", "conversation", CONTEXT), trash: useAction("trash", "conversation", CONTEXT),
    deleteForever: useAction("deleteForever", "conversation", CONTEXT), notSpam: useAction("notSpam", "conversation", CONTEXT),
    moveToInbox: useAction("moveToInbox", "conversation", CONTEXT), mute: useAction("mute", "conversation", CONTEXT),
    markUnread: useAction("markUnread", "conversation", CONTEXT), spam: useAction("spam", "conversation", CONTEXT),
  } satisfies Record<ConversationCommand, unknown>;
  const setStarred = useAction<{ starred: boolean }>("setStarred", "conversation", CONTEXT);
  const respond = useAction<{ mode: string }>("respond", "conversation", CONTEXT);

  useEffect(() => {
    if (!ready || pendingReply.threadId !== threadId) return;
    pendingReply.threadId = null;
    void respond(null, { mode: "reply" });
  }, [ready, threadId]);

  const run = (command: ConversationCommand) => {
    setMenu(null);
    void actions[command](null).then(result => show({ text: result.outcome === "observed" ? DONE_TEXT[command] ?? "Done" : result.message ?? "Couldn't finish. Try again." }));
  };

  const source = (): EmailSource | null => {
    if (!conversation) return null;
    const first = conversation.messages[0];
    const last = conversation.messages[conversation.messages.length - 1];
    return {
      threadId, subject: conversation.subject, sender: first?.sender ?? "", snippet: (last?.snippet || textOf(last?.body ?? [])).slice(0, 200),
      receivedAt: last?.time ?? "", accountId: account?.id ?? "unknown",
    };
  };

  const openForm = (type: "reminder" | "todo" | "snooze") => {
    const email = source();
    setMenu(null);
    if (!email) return;
    navigate({ screen: "add", params: { type, emails: JSON.stringify([email]), archive: "conversation" } });
  };

  const { saveMany, removeMany } = useItems();
  const quick = async (date: Date) => {
    const email = source();
    setMenu(null);
    if (!email) return;
    const item = newItem("reminder", email, account?.id ?? "unknown", { title: suggestTitle(email.subject), dueDate: dateKey(date), dueTime: timeKey(date) });
    try {
      await saveMany([item]);
      show({ text: `Reminder set · ${whenLabel(item, now)}`, undo: () => void removeMany([item.id]), view: () => openItem(item.id) });
    } catch {
      show({ text: "Couldn't save. Try again." });
    }
  };

  let body;
  if (!conversation) body = page.status === "error" ? <Notice title="Couldn't open this email" role="alert" icon="alert"><p>{page.error?.message}</p></Notice>
    : <Skeleton label="Loading email" kind="text" rows={5} />;
  else body = <>
    <div className="subject-row">
      <h1 className="conversation-subject">{conversation.subject}</h1>
      <IconButton icon="star" label={conversation.starred ? "Unstar" : "Star"} filled={conversation.starred} pressed={conversation.starred}
        className={conversation.starred ? "star on" : "star"} disabled={!ready} onClick={() => void setStarred(null, { starred: !conversation.starred })} />
    </div>
    <div className="conversation-meta">
      {account && <span className="account-line"><AccountDot color={account.color} /> {account.name}</span>}
      {conversation.labels.slice(0, 3).map(label => <span key={label} className="chip-small label">{label}</span>)}
      {conversation.messages.length > 1 && <span className="muted">{conversation.messages.length} messages</span>}
    </div>
    {linked.length > 0 && <section className="linked-items" aria-label="Linked items">
      <h2 className="section-label">{linked.length === 1 ? "1 item linked" : `${linked.length} items linked`}</h2>
      <ul className="item-list card">{linked.map(item => <ItemRow key={item.id} item={item} now={now} onOpen={() => openItem(item.id)} />)}</ul>
    </section>}
    <ol className="messages">
      {conversation.messages.map((message, index) => <MessageView key={message.id} message={message} last={index === conversation.messages.length - 1} />)}
    </ol>
    <div className="reply-row">
      <button type="button" className="outline" disabled={!ready} onClick={() => void respond(null, { mode: "reply" })}><Icon name="reply" /> Reply</button>
      <button type="button" className="outline" disabled={!ready} onClick={() => void respond(null, { mode: "replyAll" })}><Icon name="replyAll" /> Reply all</button>
      <button type="button" className="outline" disabled={!ready} onClick={() => void respond(null, { mode: "forward" })}><Icon name="forward" /> Forward</button>
    </div>
  </>;

  const commands = conversation?.commands ?? [];
  const primary: ConversationCommand[] = commands.includes("moveToInbox") ? ["moveToInbox", "trash", "markUnread"] : ["archive", "trash", "markUnread"];
  const extra = commands.filter(command => !primary.includes(command));
  const icons: Partial<Record<ConversationCommand, "archive" | "trash" | "unread" | "inbox">> = { archive: "archive", trash: "trash", markUnread: "unread", moveToInbox: "inbox" };

  return <div className="screen-frame">
    <header className="top-bar">
      <IconButton icon="back" label={`Back to ${list.title}`} onClick={back} />
      <span className="spacer" />
      {primary.map(command => <IconButton key={command} icon={icons[command]!} label={COMMAND_LABELS[command]}
        disabled={!ready || !commands.includes(command)} onClick={() => run(command)} />)}
      <IconButton icon="clock" label="Snooze" disabled={!ready} onClick={() => openForm("snooze")} />
      <IconButton icon="more" label="More" disabled={!ready} pressed={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")} />
    </header>
    {menu === "more" && <Popover onClose={() => setMenu(null)} className="more-menu">
      {extra.map(command => <button type="button" role="menuitem" key={command} onClick={() => run(command)}>{COMMAND_LABELS[command]}</button>)}
      <button type="button" role="menuitem" onClick={() => { setMenu(null); navigate({ screen: "settings" }); }}>Gmail Only settings</button>
    </Popover>}
    <ScrollMemory className="screen conversation" aria-busy={!ready}>
      {settings.showAddTo && <div className="add-to">
        <button type="button" className="add-pill" aria-expanded={menu === "add"} disabled={!conversation} onClick={() => setMenu(menu === "add" ? null : "add")}>
          <Icon name="plus" /> Add to… <Icon name={menu === "add" ? "up" : "down"} />
        </button>
        <span className="muted">Save this email as a reminder or to-do</span>
      </div>}
      {menu === "add" && <Popover onClose={() => setMenu(null)} className="add-menu">
        <button type="button" role="menuitem" className="add-option" onClick={() => openForm("reminder")}>
          <span className="tile reminder"><Icon name="bell" /></span>
          <span><strong>Add a reminder</strong><small>Get notified at a set time</small></span>
        </button>
        <button type="button" role="menuitem" className="add-option" onClick={() => openForm("todo")}>
          <span className="tile todo"><Icon name="check2" /></span>
          <span><strong>Add to to-do</strong><small>A task to finish, due date optional</small></span>
        </button>
        <div className="quick-row">
          <span className="section-label">Quick</span>
          {quickPresets(settings.defaultReminderTime, now).map(preset => <button type="button" key={preset.id} className="chip" onClick={() => void quick(preset.date)}>
            <Icon name="clock" size={14} /> {preset.label}
          </button>)}
        </div>
      </Popover>}
      {body}
    </ScrollMemory>
  </div>;
}

const textOf = (runs: TextRun[]) => runs.map(run => run.text).join("").replace(/\s+/g, " ").trim();

function MessageView({ message, last }: { message: Message; last: boolean }) {
  const { navigate } = useNavigation();
  const [open, setOpen] = useState(last || message.body.length > 0);
  const hasBody = message.body.length > 0;
  return <li className="message">
    <button type="button" className="message-head" aria-expanded={open} disabled={!hasBody} onClick={() => setOpen(!open)}>
      <Avatar name={message.sender} size={36} />
      <span className="message-who">
        <strong>{message.sender}</strong>
        <span className="muted">{message.recipients}{message.time && message.time !== message.recipients ? ` · ${message.time}` : ""}</span>
      </span>
    </button>
    {open && hasBody ? <div className="message-body" dir="auto">
      {message.body.map((run, index) => run.href
        ? <a key={index} href={run.href} onClick={event => { event.preventDefault(); navigate({ url: run.href! }); }}>{run.text}</a>
        : run.bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>)}
      {message.truncated && <p className="muted">This message is long. The rest is in Gmail.</p>}
    </div> : <p className="message-snippet">{message.snippet}</p>}
    {message.attachments.length > 0 && <ul className="attachments">
      {message.attachments.map((file, index) => <li key={index} className="attachment-card">
        <span className="file-tile">{(file.name.split(".").pop() ?? "file").slice(0, 4).toUpperCase()}</span>
        <span><strong>{file.name}</strong>{file.size && <small>{file.size}</small>}</span>
      </li>)}
    </ul>}
  </li>;
}

