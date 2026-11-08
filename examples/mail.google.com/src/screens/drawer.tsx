import { useEffect } from "react";
import { ScrollMemory, useAction, useNavigation, useRecord, useRegion } from "@genesis/sdk/react";
import { isDueNow, LISTS, MULTI_ACCOUNT_ENABLED, type MenuEntry } from "../model";
import { useAccounts, useItems, useNow } from "../store";
import { AccountDot, Icon, IconButton, Logo, Skeleton, type IconName } from "../components/ui";
import { CONTEXT, reportCount, useMailNav } from "../components/mail";

/**
 * The drawer, drawn over Gmail's menu view (`#mn`). Folders with a known path navigate by URL;
 * the person's own labels open through Gmail's menu item, because their paths are Gmail's.
 */
export function DrawerScreen() {
  const menu = useRegion<MenuEntry>("menu", CONTEXT);
  const menuAccount = useRecord<{ email: string | null }>("menuAccount", null, CONTEXT)?.data;
  const open = useAction("open", "menu", CONTEXT);
  const { navigate, back } = useNavigation();
  const mail = useMailNav();
  const { current } = useAccounts();
  const { items } = useItems();
  const now = useNow();
  const entries = menu.order.map(key => menu.get(key)?.data).filter((entry): entry is MenuEntry => !!entry);
  const byArg = new Map(entries.map(entry => [entry.arg, entry]));
  const labels = entries.filter(entry => entry.kind === "label");
  const due = items.filter(item => isDueNow(item, now)).length;
  const snoozed = items.filter(item => item.snooze && !item.done).length;
  const email = current?.email ?? menuAccount?.email ?? "";

  useEffect(() => {
    for (const list of LISTS) {
      const entry = byArg.get(list.arg);
      if (entry) reportCount(list.id, entry.count ?? 0);
    }
  }, [entries]);

  const row = (key: string, icon: IconName, label: string, count: number | null, onClick: () => void, tone?: string) =>
    <li key={key}><button type="button" className={`drawer-row ${tone ?? ""}`} onClick={onClick}>
      <Icon name={icon} /><span>{label}</span>{count ? <span className="count">{count}</span> : null}
    </button></li>;

  return <div className="screen-frame drawer">
    <header className="top-bar">
      <Logo />
      <span className="spacer" />
      <IconButton icon="close" label="Close menu" onClick={back} />
    </header>
    <ScrollMemory className="screen" aria-busy={menu.status !== "ready"}>
      <button type="button" className="account-card" onClick={() => navigate({ screen: "accounts" })}>
        {current && <AccountDot color={current.color} />}
        <span><strong>{current?.name ?? "Account"}</strong><small>{email}</small></span>
        <Icon name={MULTI_ACCOUNT_ENABLED ? "down" : "right"} />
      </button>
      <ul className="drawer-list">
        {row("todo", "todo", "To-do & reminders", due, () => navigate({ screen: "todo", mode: "root" }), "accent")}
        {row("snoozed", "clock", "Snoozed", snoozed, () => navigate({ screen: "snoozed" }))}
      </ul>
      <h2 className="section-label">Gmail</h2>
      {!entries.length && menu.status !== "ready" ? <Skeleton label="Loading folders" rows={6} kind="text" />
        : <ul className="drawer-list">
          {LISTS.map(list => row(list.id, list.icon as IconName, list.title, byArg.get(list.arg)?.count ?? null, () => mail.list(list.path, "replace")))}
        </ul>}
      {labels.length > 0 && <>
        <h2 className="section-label">Labels</h2>
        <ul className="drawer-list">
          {labels.map(label => row(label.arg, "label", label.label, label.count, () => void open(label.arg)))}
        </ul>
      </>}
      <ul className="drawer-list end">
        {row("settings", "settings", "Gmail Only settings", null, () => navigate({ screen: "settings" }))}
      </ul>
    </ScrollMemory>
  </div>;
}
