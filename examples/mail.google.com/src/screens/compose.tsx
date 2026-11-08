import { useEffect, useState } from "react";
import { ScrollMemory, useAction, useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import { addDays, at, clock, dateKey, longDay, startOfDay, type ComposeState } from "../model";
import { useAccounts, useItems, useNow, useToast } from "../store";
import { AccountDot, Icon, IconButton, Skeleton, Toggle } from "../components/ui";
import { CONTEXT, newItem, suggestTitle } from "../components/mail";

const FOLLOW_UP_DAYS = 3;
const FOLLOW_UP_TIME = "10:00";

/** The day "Remind me if no reply" lands on: a few days later, moved off the weekend. */
function followUpDate(now: Date): Date {
  let day = addDays(startOfDay(now), FOLLOW_UP_DAYS);
  while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1);
  return at(day, FOLLOW_UP_TIME);
}

/**
 * Compose, reply and forward. The address and subject fields are Gmail's, filled as the person
 * types. Gmail's message body is a rich-text field Genesis cannot fill, so the person writes the
 * message and sends it in Gmail itself ("Continue in Gmail"); the follow-up to-do is saved then.
 */
export function ComposeScreen() {
  const page = usePage(CONTEXT);
  const compose = useRecord<ComposeState>("compose", null, CONTEXT)?.data;
  const fill = useAction<Record<string, string>>("fill", "compose", CONTEXT);
  const discard = useAction("discard", "compose", CONTEXT);
  const { viewWebsite, back } = useNavigation();
  const { current } = useAccounts();
  const { saveMany, removeMany } = useItems();
  const { show } = useToast();
  const now = useNow();
  const [fields, setFields] = useState({ to: "", cc: "", bcc: "", subject: "" });
  const [loaded, setLoaded] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [remind, setRemind] = useState(false);
  const ready = page.status === "ready" && !page.stale && compose !== undefined;

  useEffect(() => {
    if (!compose || loaded) return;
    setFields({ to: compose.to, cc: compose.cc, bcc: compose.bcc, subject: compose.subject });
    if (compose.cc || compose.bcc) setShowCc(true);
    setLoaded(true);
  }, [compose, loaded]);

  const reply = /^re:/i.test(compose?.subject ?? "");
  const forward = /^fwd?:/i.test(compose?.subject ?? "");
  const title = reply ? "Reply" : forward ? "Forward" : "New message";
  const follow = followUpDate(now);

  const push = () => fill(null, fields);

  async function continueInGmail() {
    const result = await push();
    if (result.outcome !== "observed") {
      show({ text: "Couldn't copy the fields to Gmail. Check them there." });
    }
    if (remind) {
      const subject = fields.subject.trim() || "(no subject)";
      const item = newItem("todo", {
        threadId: null, sender: fields.to.trim() || "Recipient", subject, snippet: "Sent by you", receivedAt: "", accountId: current?.id ?? "unknown",
      }, current?.id ?? "unknown", {
        title: `Follow up: ${suggestTitle(subject)}`.slice(0, 200), dueDate: dateKey(follow), dueTime: FOLLOW_UP_TIME, notify: true, bringBack: false,
      });
      try {
        await saveMany([item]);
        show({ text: `Follow-up added for ${longDay(follow)}`, undo: () => void removeMany([item.id]) });
      } catch {
        show({ text: "Couldn't save the follow-up." });
      }
    }
    viewWebsite();
  }

  // Gmail's own Close returns to the list it came from, so only go back when that did not run.
  async function close() {
    const result = await discard(null);
    if (result.outcome !== "observed") back();
  }

  if (!compose) return <div className="screen-frame">
    <header className="top-bar"><IconButton icon="close" label="Close" onClick={back} /><h1>Compose</h1></header>
    <Skeleton label="Opening compose" kind="text" rows={4} />
  </div>;

  const field = (name: keyof typeof fields, label: string, type = "text") => <label className="compose-field">
    <span>{label}</span>
    <input type={type} value={fields[name]} inputMode={type === "email" ? "email" : undefined} autoComplete="off"
      onChange={event => setFields(previous => ({ ...previous, [name]: event.target.value }))} onBlur={() => void push()} />
  </label>;

  return <div className="screen-frame compose-screen">
    <header className="top-bar">
      <IconButton icon="close" label="Discard draft" onClick={() => void close()} />
      <h1>{title}</h1>
      <span className="spacer" />
      <button type="button" className="accent send" disabled={!ready} onClick={() => void continueInGmail()}>
        <Icon name="send" /> Continue
      </button>
    </header>
    <ScrollMemory className="screen" aria-busy={!ready}>
      <div className="compose-card">
        <div className="compose-field from">
          <span>From</span>
          {current && <AccountDot color={current.color} />}
          <span className="from-value">{compose.from || current?.email}</span>
        </div>
        <div className="compose-to">
          {field("to", "To", "email")}
          {!showCc && <button type="button" className="link-button" onClick={() => setShowCc(true)}>Cc/Bcc</button>}
        </div>
        {showCc && <>{field("cc", "Cc", "email")}{field("bcc", "Bcc", "email")}</>}
        {field("subject", "Subject")}
        <div className="compose-body-note">
          <Icon name="pencil" />
          <p>Write your message in Gmail. Gmail Only copies the fields above, then opens Gmail's compose so you can write and send.
            {compose.body ? <><br /><span className="muted">Already written: “{compose.body.slice(0, 120)}{compose.body.length > 120 ? "…" : ""}”</span></> : null}</p>
        </div>
      </div>
      <div className="card remind-card">
        <Toggle icon={<span className="tile reminder small"><Icon name="bell" /></span>} label="Remind me if no reply"
          detail={`Adds a to-do for ${longDay(follow)} · ${clock(FOLLOW_UP_TIME).replace(":00", "")}`} checked={remind} onChange={setRemind} />
      </div>
      <p className="hint padded">Gmail's mobile web has no scheduled send, and Gmail Only never sends for you. The follow-up stays on your list until you tick it off.</p>
      <button type="button" className="accent block padded-x" disabled={!ready} onClick={() => void continueInGmail()}>
        Continue in Gmail <Icon name="external" />
      </button>
    </ScrollMemory>
  </div>;
}
