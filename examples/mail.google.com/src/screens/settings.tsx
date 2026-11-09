import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { clock, type Settings } from "../model";
import { useAccounts, useSettings } from "../store";
import { AccountDot, Chips, Icon, Toggle, TopBar } from "../components/ui";

type Swipe = Settings["swipeRight"];

/** Gmail Only's own settings. Gmail's settings stay in Gmail. */
export function SettingsScreen() {
  const { settings, update } = useSettings();
  const { accounts } = useAccounts();
  const { navigate, viewWebsite } = useNavigation();
  const set = (patch: Partial<Settings>) => void update(patch);
  const swipe = [{ id: "remind", label: "Remind" }, { id: "archive", label: "Archive" }, { id: "none", label: "Off" }] as { id: Swipe; label: string }[];

  return <div className="screen-frame">
    <TopBar title="Settings" />
    <ScrollMemory className="screen settings">
      <h2 className="section-label">Reminders &amp; to-dos</h2>
      <div className="card">
        <Toggle label="Show Add to… on emails" detail="The pill above every open email" checked={settings.showAddTo} onChange={value => set({ showAddTo: value })} />
        <div className="setting-row">
          <span>Default sort</span>
          <Chips<Settings["defaultSort"]> label="Default sort" value={settings.defaultSort} onChange={value => set({ defaultSort: value })}
            options={[{ id: "due", label: "When it's due" }, { id: "added", label: "When I added it" }]} />
        </div>
        <label className="setting-row">
          <span>Default reminder time<small>Used by Tomorrow and Next week</small></span>
          <input type="time" value={settings.defaultReminderTime} onChange={event => event.target.value && set({ defaultReminderTime: event.target.value })} />
        </label>
        <Toggle label="Morning summary" detail={settings.morningSummary ? `Today's card at ${clock(settings.morningSummary)}` : "Off"}
          checked={settings.morningSummary !== null} onChange={value => set({ morningSummary: value ? "08:00" : null })} />
        {settings.morningSummary !== null && <label className="setting-row nested">
          <span>Summary time</span>
          <input type="time" value={settings.morningSummary} onChange={event => event.target.value && set({ morningSummary: event.target.value })} />
        </label>}
        <Toggle label="Archive email after adding to to-do" checked={settings.archiveAfterAdding} onChange={value => set({ archiveAfterAdding: value })} />
        <div className="setting-row">
          <span>Keep done items</span>
          <Chips<string> label="Keep done items" value={String(settings.keepDoneDays)} onChange={value => set({ keepDoneDays: Number(value) })}
            options={[{ id: "1", label: "1 day" }, { id: "7", label: "7 days" }, { id: "30", label: "30 days" }]} />
        </div>
      </div>
      <p className="hint padded">Gmail Only shows what's due inside the app: the To-do badge, the Today card and "Back in your inbox". It doesn't send phone notifications.</p>

      <h2 className="section-label">Swipe on emails</h2>
      <div className="card">
        <div className="setting-row"><span><Icon name="right" size={16} /> Swipe right</span>
          <Chips<Swipe> label="Swipe right" value={settings.swipeRight} onChange={value => set({ swipeRight: value })} options={swipe} /></div>
        <div className="setting-row"><span><Icon name="back" size={16} /> Swipe left</span>
          <Chips<Swipe> label="Swipe left" value={settings.swipeLeft} onChange={value => set({ swipeLeft: value })} options={swipe} /></div>
      </div>

      <h2 className="section-label">Appearance</h2>
      <div className="card">
        <div className="setting-row"><span>Theme</span>
          <Chips<Settings["theme"]> label="Theme" value={settings.theme} onChange={value => set({ theme: value })}
            options={[{ id: "system", label: "System" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} /></div>
      </div>

      <h2 className="section-label">Accounts</h2>
      <ul className="plain-list card">
        {accounts.map(account => <li key={account.id}>
          <button type="button" className="list-button" onClick={() => navigate({ screen: "account-setup", params: { id: account.id } })}>
            <AccountDot color={account.color} /><span><strong>{account.name}</strong><small>{account.email}</small></span><Icon name="right" />
          </button>
        </li>)}
        <li><button type="button" className="list-button" onClick={() => navigate({ screen: "accounts" })}>
          <Icon name="user" /><span>Manage accounts</span><Icon name="right" />
        </button></li>
      </ul>

      <h2 className="section-label">Gmail</h2>
      <ul className="plain-list card">
        <li><button type="button" className="list-button" onClick={() => viewWebsite()}>
          <Icon name="mail" /><span><strong>Open Gmail itself</strong><small>For anything Gmail Only doesn't draw</small></span><Icon name="external" />
        </button></li>
      </ul>
    </ScrollMemory>
  </div>;
}
