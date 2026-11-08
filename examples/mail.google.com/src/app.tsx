import { useEffect, type ComponentType } from "react";
import { useNavigation } from "@genesis/sdk/react";
import { INBOX, isDueNow } from "./model";
import { DataProvider, ToastProvider, useItems, useNow, usePurgeDone, useSettings, useToast } from "./store";
import { Icon } from "./components/ui";
import { CONTEXT, useCount, useMailNav, useMailView } from "./components/mail";
import { MailScreen } from "./screens/mail";
import { TodoScreen } from "./screens/todo";
import { ItemScreen } from "./screens/item";
import { AddScreen } from "./screens/add";
import { BulkScreen } from "./screens/bulk";
import { SearchScreen } from "./screens/search";
import { SettingsScreen } from "./screens/settings";
import { AccountsScreen } from "./screens/accounts";
import { AccountSetupScreen } from "./screens/account-setup";
import { SnoozedScreen } from "./screens/snoozed";

const SCREENS: Record<string, ComponentType> = {
  mail: MailScreen, todo: TodoScreen, item: ItemScreen, add: AddScreen, bulk: BulkScreen, search: SearchScreen,
  settings: SettingsScreen, accounts: AccountsScreen, "account-setup": AccountSetupScreen, snoozed: SnoozedScreen,
};

/** Sheets draw over the screen below them, so that screen stays rendered. */
const SHEETS = new Set(["add", "bulk"]);

export function App() {
  return <DataProvider><ToastProvider><Shell /></ToastProvider></DataProvider>;
}

function Shell() {
  const { screen, overlay, select, navigate } = useNavigation();
  const { view } = useMailView();
  const nav = useMailNav();
  const { items } = useItems();
  const { settings } = useSettings();
  const now = useNow();
  const unread = useCount(INBOX.id);
  usePurgeDone();

  useEffect(() => {
    if (settings.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // A sheet keeps the screen it opened from visible behind it.
  const sheet = screen && SHEETS.has(screen.id) ? screen : null;
  const base = sheet ? overlay[overlay.length - 2] : undefined;
  const Under = sheet ? SCREENS[base?.id ?? "mail"] : undefined;
  const Screen = screen ? SCREENS[screen.id] : undefined;
  const shownId = sheet ? base?.id ?? "mail" : screen?.id;

  const onTodo = shownId === "todo";
  const onList = shownId === "mail" && view.kind === "list";
  const tabs = !sheet && (onTodo || onList);
  const due = items.filter(item => isDueNow(item, now)).length;

  const mailTab = () => {
    // The page under To-do may be Gmail's menu (To-do opened from the drawer); then open the inbox.
    if (overlay.length && view.kind === "list") select(CONTEXT);
    else if (overlay.length) nav.inbox("replace");
    else if (view.kind === "list" && view.list.id === INBOX.id) document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" });
    else nav.inbox();
  };

  return <div className="app">
    <main className="content">
      {sheet && Under && <Under key={base?.key ?? "under"} />}
      {Screen && <Screen key={screen!.key} />}
    </main>
    {tabs && <nav className="tabs" aria-label="Sections">
      <button type="button" className="tab" aria-current={!onTodo ? "page" : undefined} onClick={mailTab}>
        <span className="tab-icon"><Icon name="mail" filled={!onTodo} />{unread ? <span className="badge">{unread > 99 ? "99+" : unread}</span> : null}</span>
        <span>Mail</span>
      </button>
      <button type="button" className="tab" aria-current={onTodo ? "page" : undefined}
        onClick={() => onTodo ? document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" }) : navigate({ screen: "todo", mode: "root" })}>
        <span className="tab-icon"><Icon name="todo" />{due ? <span className="badge due">{due > 99 ? "99+" : due}</span> : null}</span>
        <span>To-do</span>
      </button>
    </nav>}
    <ToastView />
  </div>;
}

function ToastView() {
  const { toast, clear } = useToast();
  if (!toast) return <div className="toast-region" role="status" aria-live="polite" />;
  return <div className="toast-region" role="status" aria-live="polite">
    <div className="toast" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && <button type="button" onClick={() => { const undo = toast.undo!; clear(); undo(); }}>Undo</button>}
      {toast.view && <button type="button" onClick={() => { const view = toast.view!; clear(); view(); }}>View</button>}
    </div>
  </div>;
}
