import { useNavigation } from "@genesis/sdk/react";
import { Icon, Sheet, type IconName } from "../components/ui";
import { parseEmails } from "./add";

/** "Save for later" for selected emails: reminders, to-dos or a snooze. Param: `emails`. */
export function BulkScreen() {
  const { screen, back, navigate } = useNavigation();
  const raw = screen?.params.emails;
  const emails = parseEmails(raw);
  const next = (type: "reminder" | "todo" | "snooze") =>
    navigate({ screen: "add", mode: "replace", params: { type, emails: raw ?? "[]", archive: "selected" } });
  const option = (type: "reminder" | "todo" | "snooze", icon: IconName, tone: string, title: string, detail: string) =>
    <li><button type="button" className="add-option" onClick={() => next(type)}>
      <span className={`tile ${tone}`}><Icon name={icon} /></span>
      <span><strong>{title}</strong><small>{detail}</small></span>
      <Icon name="right" />
    </button></li>;
  return <Sheet title={`Save ${emails.length} ${emails.length === 1 ? "email" : "emails"} for later`} icon="bell" tone="neutral" onClose={back}>
    {!emails.length ? <p className="sheet-lead">Nothing is selected.</p> : <ul className="option-list">
      {option("reminder", "bell", "reminder", "Add reminders", "One per email, all at the same time")}
      {option("todo", "check2", "todo", "Add to to-do", "One task per email; archive them if you like")}
      {option("snooze", "clock", "neutral", "Snooze", "Archive now, back at the top later")}
    </ul>}
  </Sheet>;
}
