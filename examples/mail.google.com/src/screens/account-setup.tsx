import { useEffect, useState } from "react";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { ACCOUNT_COLORS, COLOR_NAMES } from "../model";
import { useAccounts, useToast } from "../store";
import { Icon, Toggle, TopBar } from "../components/ui";

/** Name, color and visibility for one account. Param: `id`. */
export function AccountSetupScreen() {
  const { screen, back } = useNavigation();
  const { byId, save } = useAccounts();
  const { show } = useToast();
  const account = byId(screen?.params.id ?? "");
  const [name, setName] = useState(account?.name ?? "");
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0]);
  const [inbox, setInbox] = useState(account?.showInInbox ?? true);
  const [todo, setTodo] = useState(account?.showInTodo ?? true);

  // The account record can arrive after the screen opens.
  useEffect(() => {
    if (!account) return;
    setName(account.name); setColor(account.color); setInbox(account.showInInbox); setTodo(account.showInTodo);
  }, [account?.id]);

  if (!account) return <div className="screen-frame"><TopBar title="Account" /><div className="screen" /></div>;

  const submit = async () => {
    try {
      await save({ ...account, name: name.trim() || account.name, color, showInInbox: inbox, showInTodo: todo });
      back();
      show({ text: "Account saved" });
    } catch {
      show({ text: "Couldn't save. Try again." });
    }
  };

  return <div className="screen-frame">
    <TopBar title="Set up account" />
    <ScrollMemory className="screen">
      <div className="account-preview" style={{ ["--account" as string]: color }}>
        <span className="account-badge">{(name || account.email)[0]?.toUpperCase()}</span>
        <strong>{name || account.name}</strong>
        <small>{account.email}</small>
      </div>
      <label className="field padded-x">
        <span>Name</span>
        <input value={name} maxLength={40} placeholder="Personal, Work…" onChange={event => setName(event.target.value)} />
      </label>
      <h2 className="section-label">Color</h2>
      <div className="swatches" role="radiogroup" aria-label="Color">
        {ACCOUNT_COLORS.map((value, index) => <button type="button" key={value} role="radio" aria-checked={value === color}
          aria-label={COLOR_NAMES[index]} className="swatch" style={{ background: value }} onClick={() => setColor(value)}>
          {value === color && <Icon name="check" />}
        </button>)}
      </div>
      <p className="hint padded">The color marks this account's emails, reminders and to-dos.</p>
      <div className="card">
        <Toggle label="Show in inbox" checked={inbox} onChange={setInbox} />
        <Toggle label="Show in To-do" checked={todo} onChange={setTodo} />
      </div>
    </ScrollMemory>
    <footer className="action-bar">
      <button type="button" className="accent block" onClick={() => void submit()}>Save</button>
    </footer>
  </div>;
}
