import { useMemo, useState } from "react";
import { useAction, useNavigation } from "@genesis/sdk/react";
import {
  addDays, at, dateKey, dueDateFor, longDay, parseDate, presetDetail, REPEAT_LABELS, reminderPresets, startOfDay, timeKey, whenLabel,
  type DueChoice, type Item, type ItemType, type Preset, type Priority, type Repeat,
} from "../model";
import { useAccounts, useItems, useNow, useSettings, useToast } from "../store";
import { AccountDot, Chips, Icon, Sheet, Toggle } from "../components/ui";
import { CONTEXT, firstSender, linkedTo, newItem, suggestTitle, type EmailSource } from "../components/mail";

/**
 * The reminder and to-do forms, and snooze. Opened as a sheet over the email with params:
 * - `type`: "reminder", "todo" or "snooze"
 * - `emails`: the emails as JSON (one or many), captured when the sheet opened
 * - `archive`: how to archive afterwards: "conversation", "row" or "selected"
 * - `itemId`: an item to edit instead
 */

/** Snooze times from the bulk sheet in the brief. */
export function snoozePresets(now: Date): Preset[] {
  const today = startOfDay(now);
  const list: Preset[] = [];
  const evening = at(today, "18:00");
  if (evening.getTime() - now.getTime() > 30 * 60_000) list.push({ id: "evening", label: "Later today", date: evening, detail: presetDetail(evening, now) });
  const morning = at(addDays(today, 1), "08:00");
  list.push({ id: "tomorrow", label: "Tomorrow", date: morning, detail: presetDetail(morning, now) });
  const monday = at(addDays(today, ((8 - today.getDay()) % 7) || 7), "08:00");
  list.push({ id: "week", label: "Next week", date: monday, detail: presetDetail(monday, now) });
  return list;
}

export function parseEmails(raw: string | undefined): EmailSource[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(entry => typeof entry?.subject === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

/** Archives the email(s) the sheet was opened for, the way the opener said. Runs in Gmail's context. */
export function useArchiveAfter() {
  const conversation = useAction("archive", "conversation", CONTEXT);
  const row = useAction("archive", "threads", CONTEXT);
  const selected = useAction("archiveSelected", null, CONTEXT);
  return (how: string | undefined, emails: EmailSource[]) => {
    if (how === "conversation") return conversation(null);
    if (how === "row" && emails[0]?.threadId) return row(emails[0].threadId);
    if (how === "selected") return selected(null);
    return Promise.resolve(null);
  };
}

/** Saves items, archives when asked, closes the sheet and offers Undo and View. */
export function useCommitItems() {
  const { saveMany, removeMany } = useItems();
  const { back, navigate } = useNavigation();
  const { show } = useToast();
  const archive = useArchiveAfter();
  return async (items: Item[], message: string, archiveHow?: string, emails: EmailSource[] = []) => {
    try {
      await saveMany(items);
    } catch {
      show({ text: "Couldn't save. Try again." });
      return false;
    }
    back();
    const archived = archiveHow ? archive(archiveHow, emails) : null;
    show({
      text: message,
      undo: () => {
        void removeMany(items.map(item => item.id));
        if (archived) show({ text: "Item removed. The email is in All mail." });
      },
      view: items.length === 1 ? () => navigate({ screen: "item", params: { id: items[0].id } }) : () => navigate({ screen: "todo", mode: "root" }),
    });
    return true;
  };
}

interface Form {
  type: ItemType;
  title: string;
  note: string;
  preset: string;
  picked: string;
  repeat: Repeat;
  bringBack: boolean;
  due: DueChoice;
  pickedDate: string;
  notify: boolean;
  time: string;
  priority: Priority;
  archive: boolean;
}

function initialForm(type: ItemType, item: Item | undefined, emails: EmailSource[], archiveDefault: boolean, defaultTime: string, now: Date): Form {
  const base: Form = {
    type, title: emails.length === 1 ? suggestTitle(emails[0].subject) : "", note: "", preset: "", picked: "", repeat: "never",
    bringBack: true, due: "today", pickedDate: dateKey(addDays(now, 1)), notify: false, time: defaultTime, priority: "normal", archive: archiveDefault,
  };
  if (!item) return base;
  const dueDate = item.dueDate ?? "";
  const pickedValue = item.dueDate && item.dueTime ? `${item.dueDate}T${item.dueTime}` : "";
  return {
    ...base, type: item.type, title: item.title, note: item.note, repeat: item.repeat, bringBack: item.bringBack, priority: item.priority,
    preset: item.type === "reminder" && pickedValue ? "pick" : "", picked: pickedValue,
    due: item.dueDate ? "pick" : "none", pickedDate: dueDate || base.pickedDate, notify: item.type === "todo" && !!item.dueTime,
    time: item.dueTime ?? defaultTime, archive: false,
  };
}

export function AddScreen() {
  const { screen, back } = useNavigation();
  const params = screen?.params ?? {};
  const now = useNow();
  const { items } = useItems();
  const accounts = useAccounts();
  const { settings } = useSettings();
  const commit = useCommitItems();
  const editing = params.itemId ? items.find(item => item.id === params.itemId) : undefined;
  const emails = useMemo(() => editing?.link ? [{ ...editing.link, accountId: editing.accountId }] : parseEmails(params.emails), [editing, params.emails]);
  const mode = params.type === "snooze" ? "snooze" : null;
  const [form, setForm] = useState<Form>(() => initialForm(params.type === "todo" ? "todo" : "reminder", editing, emails, settings.archiveAfterAdding, settings.defaultReminderTime, now));
  const set = (patch: Partial<Form>) => setForm(current => ({ ...current, ...patch }));
  const [saving, setSaving] = useState(false);

  const presets = reminderPresets(settings.defaultReminderTime, now);
  const preset = form.preset || (presets.find(entry => entry.id === "later") ?? presets.find(entry => entry.id === "tomorrow") ?? presets[0]).id;
  const pickMin = `${dateKey(now)}T${timeKey(now)}`;
  const reminderAt: Date | null = preset === "pick" ? (form.picked ? new Date(form.picked) : null) : presets.find(entry => entry.id === preset)?.date ?? null;
  const reminderValid = reminderAt !== null && reminderAt > now;

  const account = emails[0] ? accounts.byId(emails[0].accountId) : accounts.current;
  const accountId = account?.id ?? accounts.current?.id ?? "unknown";
  const linkedCount = emails.length === 1 ? linkedTo(items, emails[0].threadId).filter(item => item.id !== editing?.id).length : 0;
  const many = emails.length > 1;

  const todoDate = dueDateFor(form.due, form.due === "pick" ? form.pickedDate : null, now);
  const todoDue = form.notify && !todoDate ? dateKey(now) : todoDate;
  const todoTimeValid = !form.notify || at(parseDate(todoDue!), form.time) > now;

  if (mode === "snooze") return <SnoozeSheet emails={emails} archive={params.archive} />;

  const close = () => back();
  const switchType = () => set({ type: form.type === "reminder" ? "todo" : "reminder" });

  async function save() {
    if (saving) return;
    const reminder = form.type === "reminder";
    if (reminder && !reminderValid) return;
    if (!reminder && !todoTimeValid) return;
    setSaving(true);
    const patch: Partial<Item> = reminder
      ? { type: "reminder", dueDate: dateKey(reminderAt!), dueTime: timeKey(reminderAt!), notify: true, repeat: form.repeat, bringBack: form.bringBack, priority: form.priority }
      : { type: "todo", dueDate: todoDue, dueTime: form.notify ? form.time : null, notify: form.notify, repeat: "never", bringBack: false, priority: form.priority };
    const note = form.note.trim().slice(0, 2000);
    const sources: (EmailSource | null)[] = emails.length ? emails : [null];
    const next = sources.map(email => {
      const title = (many ? suggestTitle(email!.subject) : form.title.trim()) || (email ? suggestTitle(email.subject) : "");
      if (editing) return { ...editing, ...patch, title, note, returned: false };
      return newItem(patch.type!, email, accountId, { ...patch, title, note });
    }).filter(item => item.title);
    if (!next.length) { setSaving(false); return; }
    const when = whenLabel(next[0]);
    const message = editing ? "Saved" : reminder
      ? (many ? `${next.length} reminders set · ${when}` : `Reminder set · ${when}`)
      : (many ? `${next.length} to-dos added` : "Added to to-do");
    const archiveHow = !editing && !reminder && form.archive ? params.archive : undefined;
    const ok = await commit(next, message, archiveHow, emails);
    if (!ok) setSaving(false);
  }

  const reminder = form.type === "reminder";
  const titleText = editing ? (reminder ? "Edit reminder" : "Edit to-do") : reminder ? (many ? `Add ${emails.length} reminders` : "Add a reminder") : (many ? `Add ${emails.length} to-dos` : "Add to to-do");
  const button = reminder
    ? `Save reminder${reminderValid ? ` · ${whenLabel({ dueDate: dateKey(reminderAt!), dueTime: timeKey(reminderAt!) }, now)}` : ""}`
    : editing ? "Save to-do" : many ? `Add ${emails.length} to to-do` : "Add to to-do";

  return <Sheet title={titleText} icon={reminder ? "bell" : "check2"} tone={reminder ? "reminder" : "todo"} onClose={close}
    footer={<>
      <button type="button" className={reminder ? "primary block" : "accent block"} disabled={saving || (reminder ? !reminderValid : !todoTimeValid)} onClick={() => void save()}>
        {saving ? "Saving…" : button}
      </button>
      <button type="button" className="link-button" onClick={switchType}>{reminder ? "Make it a to-do instead" : "Make it a reminder instead"}</button>
    </>}>
    {many
      ? <p className="sheet-lead">Each email becomes its own item, linked to its email. Titles come from the subjects.</p>
      : <label className="field">
        <span>{reminder ? "Remind me to" : "Task"}</span>
        <input value={form.title} autoFocus={!editing} maxLength={200} placeholder={reminder ? "What should we remind you of?" : "What needs doing?"}
          onChange={event => set({ title: event.target.value })} enterKeyHint="done" />
      </label>}
    {!reminder && !many && <label className="field">
      <span>Note <small>optional</small></span>
      <textarea rows={2} value={form.note} maxLength={2000} placeholder="Add details" onChange={event => set({ note: event.target.value })} />
    </label>}
    {emails.length > 0 && <div className="linked-card">
      {account && <AccountDot color={account.color} label={account.name} />}
      <span><strong>Linked:</strong> {many ? `${emails.length} emails` : `${firstSender(emails[0].sender)} · ${emails[0].subject}`}</span>
    </div>}
    {linkedCount > 0 && <p className="hint"><Icon name="check" size={14} /> {linkedCount === 1 ? "1 item" : `${linkedCount} items`} already linked to this email</p>}

    {reminder ? <>
      <h3 className="section-label">When</h3>
      <div className="preset-grid" role="radiogroup" aria-label="When">
        {presets.map(entry => <button type="button" role="radio" aria-checked={preset === entry.id} key={entry.id} className="preset" onClick={() => set({ preset: entry.id })}>
          <strong>{entry.label}</strong><span>{entry.detail}</span>
        </button>)}
        <button type="button" role="radio" aria-checked={preset === "pick"} className="preset" onClick={() => set({ preset: "pick", picked: form.picked || `${dateKey(addDays(now, 1))}T${settings.defaultReminderTime}` })}>
          <strong>Pick date &amp; time</strong><span>{preset === "pick" && reminderAt ? presetDetail(reminderAt, now) : "Custom"}</span>
        </button>
      </div>
      {preset === "pick" && <label className="field">
        <span>Date and time</span>
        <input type="datetime-local" min={pickMin} value={form.picked} onChange={event => set({ picked: event.target.value })} />
        {form.picked && !reminderValid && <small className="error-text">Pick a time that hasn't passed.</small>}
      </label>}
      <label className="select-row">
        <Icon name="repeat" />
        <span>Repeat</span>
        <select value={form.repeat} onChange={event => set({ repeat: event.target.value as Repeat })}>
          {(Object.keys(REPEAT_LABELS) as Repeat[]).map(value => <option key={value} value={value}>{REPEAT_LABELS[value]}</option>)}
        </select>
      </label>
      {emails.length > 0 && <Toggle label="Bring email back to top of inbox" detail="When the reminder is due" checked={form.bringBack} onChange={value => set({ bringBack: value })} />}
    </> : <>
      <h3 className="section-label">Due</h3>
      <Chips<DueChoice> label="Due" value={form.due} onChange={value => set({ due: value })} options={[
        { id: "none", label: "No date" }, { id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" },
        { id: "week", label: "This week" }, { id: "pick", label: "Pick date" },
      ]} />
      {form.due === "pick" && <label className="field">
        <span>Due date</span>
        <input type="date" min={dateKey(now)} value={form.pickedDate} onChange={event => set({ pickedDate: event.target.value })} />
      </label>}
      <p className="hint">{dueHelp(form.due, todoDate, now)}</p>
      <Toggle label="Add a time & notify me" checked={form.notify} onChange={value => set({ notify: value })} />
      {form.notify && <label className="field">
        <span>Time</span>
        <input type="time" value={form.time} onChange={event => set({ time: event.target.value })} />
        {!todoTimeValid && <small className="error-text">That time has passed today.</small>}
      </label>}
      <h3 className="section-label">Priority</h3>
      <Chips<Priority> label="Priority" value={form.priority} onChange={value => set({ priority: value })} options={[
        { id: "normal", label: "Normal" }, { id: "high", label: <><Icon name="flag" size={14} /> High</>, tone: "high" },
      ]} />
      {!editing && emails.length > 0 && params.archive && <Toggle label={many ? "Archive emails after adding" : "Archive email after adding"} checked={form.archive} onChange={value => set({ archive: value })} />}
    </>}
  </Sheet>;
}

function dueHelp(choice: DueChoice, date: string | null, now: Date): string {
  if (choice === "none" || !date) return "Goes to No date yet. You'll be nudged to schedule it.";
  const day = parseDate(date);
  const offset = Math.round((startOfDay(day).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const where = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : offset < 7 ? "This week" : "Later";
  return `Due by ${longDay(day).replace(",", "")}. Shows in ${where}.`;
}

/** Snooze: archive now, and bring the email back to the top of the inbox at the chosen time. */
function SnoozeSheet({ emails, archive }: { emails: EmailSource[]; archive: string | undefined }) {
  const { back } = useNavigation();
  const now = useNow();
  const accounts = useAccounts();
  const commit = useCommitItems();
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const presets = snoozePresets(now);
  const accountId = emails[0]?.accountId ?? accounts.current?.id ?? "unknown";

  async function snooze(date: Date) {
    if (saving || date <= now || !emails.length) return;
    setSaving(true);
    const items = emails.map(email => newItem("reminder", email, accountId, {
      title: suggestTitle(email.subject), dueDate: dateKey(date), dueTime: timeKey(date), bringBack: true, snooze: true,
    }));
    const ok = await commit(items, `Snoozed until ${presetDetail(date, now)}`, archive, emails);
    if (!ok) setSaving(false);
  }

  const pickedDate = picked ? new Date(picked) : null;
  return <Sheet title={emails.length > 1 ? `Snooze ${emails.length} emails` : "Snooze until"} icon="clock" tone="neutral" onClose={back}>
    <p className="sheet-lead">The email leaves your inbox now and comes back to the top at this time.</p>
    <ul className="option-list">
      {presets.map(entry => <li key={entry.id}>
        <button type="button" className="option" disabled={saving} onClick={() => void snooze(entry.date)}>
          <Icon name="clock" /><span>{entry.label}</span><small>{entry.detail}</small>
        </button>
      </li>)}
    </ul>
    <label className="field">
      <span>Pick date &amp; time</span>
      <input type="datetime-local" min={`${dateKey(now)}T${timeKey(now)}`} value={picked} onChange={event => setPicked(event.target.value)} />
    </label>
    <button type="button" className="primary block" disabled={saving || !pickedDate || pickedDate <= now} onClick={() => pickedDate && void snooze(pickedDate)}>
      {pickedDate && pickedDate > now ? `Snooze until ${presetDetail(pickedDate, now)}` : "Snooze"}
    </button>
    <p className="hint">Gmail's mobile web has no snooze, so Gmail Only archives the email and keeps the time. Snoozed emails are listed in the menu.</p>
  </Sheet>;
}

