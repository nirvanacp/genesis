import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { useNavigation, type CurrentScreen } from "@genesis/sdk/react";
import { INBOX, isDueNow, type MailView } from "./model";
import { DataProvider, ToastProvider, useAccounts, useItems, useNow, usePurgeDone, useSettings, useToast, type Toast } from "./store";
import { Icon, openMenus } from "./components/ui";
import { CONTEXT, resetCounts, useCount, useMailNav, useMailView } from "./components/mail";
import { ScreenParams } from "./components/screen";
import { GhostLayer, Stage, usePlaceMotion, type Motion, type Place } from "./components/motion";
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

/** Stacking of the two slots; outgoing copies play just above or below their slot. */
const BASE_Z = 10;
const SHEET_Z = 30;

type Base = Pick<CurrentScreen, "key" | "id" | "overlay" | "params">;

export function App() {
  return <DataProvider><ToastProvider><Shell /></ToastProvider></DataProvider>;
}

/** The overlay screen under a sheet, when the app opened straight onto the sheet. */
function underSheet(entry: { key: string; id: string; params: Record<string, string> } | undefined): Base | undefined {
  return entry && { key: entry.key, id: entry.id, overlay: true, params: entry.params };
}

/** What makes two mail screens different: a new history entry, or another Gmail view in the same entry. */
function viewSignature(view: MailView): string {
  switch (view.kind) {
    case "list": return `list:${view.list.path}`;
    case "conversation": return `cv:${view.threadId}`;
    case "other": return `other:${view.hash}`;
    default: return view.kind;
  }
}

function Shell() {
  const { screen, overlay, select, navigate, back } = useNavigation();
  const { view } = useMailView();
  const nav = useMailNav();
  const { items } = useItems();
  const { settings } = useSettings();
  const { toast } = useToast();
  const now = useNow();
  const unread = useCount(INBOX.id);
  // Gmail's counts belong to one inbox, so an account switch clears them. A layout effect runs
  // before the screens' effects, which then report the new inbox's counts.
  const accountId = useAccounts().current?.id ?? null;
  const lastAccount = useRef(accountId);
  useLayoutEffect(() => {
    if (accountId && lastAccount.current && accountId !== lastAccount.current) resetCounts();
    if (accountId) lastAccount.current = accountId;
  }, [accountId]);
  const ghosts = useRef<HTMLDivElement>(null);
  usePurgeDone();

  useEffect(() => {
    if (settings.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // A sheet keeps the screen it opened from mounted behind it, under the same key, so that
  // screen keeps its scroll position and state. The last screen that was not a sheet is it.
  // An open menu is a screen of its own too, so Back closes it; the screen below stays as it is.
  const sheet = screen && SHEETS.has(screen.id) ? screen : null;
  const menu = screen?.id === "menu";
  const lastBase = useRef<Base | null>(null);
  if (screen && !sheet && !menu) lastBase.current = screen;
  const base: Base = sheet || menu
    ? lastBase.current ?? underSheet(overlay[overlay.length - 2]) ?? { key: `${CONTEXT}:base`, id: "mail", overlay: false, params: {} }
    : screen ?? { key: `${CONTEXT}:base`, id: "mail", overlay: false, params: {} };
  const Base = SCREENS[base.id];
  const Sheet = sheet ? SCREENS[sheet.id] : undefined;

  const onTodo = base.id === "todo";
  const onList = base.id === "mail" && view.kind === "list";
  const tabs = !sheet && (onTodo || onList);
  const due = items.filter(item => isDueNow(item, now)).length;

  // Overlay keys carry no history index, so an overlay sits on the last context index seen.
  const contextIndex = useRef(0);
  const match = !base.overlay ? /:(\d+)$/.exec(base.key) : null;
  if (match) contextIndex.current = Number(match[1]);
  const place: Place = {
    id: base.id === "mail" ? `${base.key}|${viewSignature(view)}` : base.key,
    index: contextIndex.current,
    depth: sheet || menu ? Math.max(0, overlay.length - 1) : overlay.length,
    tab: onTodo || onList,
    drawer: base.id === "mail" && view.kind === "menu",
  };
  const baseMotion = usePlaceMotion(place);
  // A menu screen with no menu showing, after Back from a screen the menu opened: go past it.
  useEffect(() => { if (menu && openMenus.count === 0) back(); }, [menu, back]);
  const sheetMotion = useSheetMotion(sheet?.key ?? null);

  const mailTab = () => {
    // The page under To-do may be Gmail's menu (To-do opened from the drawer); then open the inbox.
    if (overlay.length && view.kind === "list") select(CONTEXT);
    else if (overlay.length) nav.inbox("replace");
    else if (view.kind === "list" && view.list.id === INBOX.id) document.querySelector(".stage .screen")?.scrollTo({ top: 0, behavior: "smooth" });
    else nav.inbox();
  };

  return <div className={`app${tabs ? " has-tabs" : ""}${toast ? " has-toast" : ""}`}>
    <main className="content">
      {/* While a sheet is open the screen behind it takes no focus or input. */}
      <Stage id={place.id} motion={baseMotion} layer={ghosts} zIndex={BASE_Z} inert={!!sheet}>
        {Base && <ScreenParams.Provider value={base.params}><Base key={base.key} /></ScreenParams.Provider>}
      </Stage>
      <Stage id={sheet?.key ?? null} motion={sheetMotion} layer={ghosts} zIndex={SHEET_Z}>
        {Sheet && <Sheet key={sheet!.key} />}
      </Stage>
      <GhostLayer layer={ghosts} />
    </main>
    {tabs && <nav className="tabs" aria-label="Sections">
      <button type="button" className="tab" aria-current={!onTodo ? "page" : undefined} onClick={mailTab}>
        <span className="tab-icon"><Icon name="mail" filled={!onTodo} />{unread ? <span className="badge" key={unread}>{unread > 99 ? "99+" : unread}</span> : null}</span>
        <span>Mail</span>
      </button>
      <button type="button" className="tab" aria-current={onTodo ? "page" : undefined}
        onClick={() => onTodo ? document.querySelector(".stage .screen")?.scrollTo({ top: 0, behavior: "smooth" }) : navigate({ screen: "todo", mode: "root" })}>
        <span className="tab-icon"><Icon name="todo" />{due ? <span className="badge due" key={due}>{due > 99 ? "99+" : due}</span> : null}</span>
        <span>To-do</span>
      </button>
    </nav>}
    <ToastView />
  </div>;
}

/** A sheet rises by itself when it mounts; closing sinks it, and one sheet replacing another swaps panels. */
function useSheetMotion(key: string | null): Motion {
  const last = useRef<{ key: string | null; motion: Motion }>({ key, motion: "none" });
  if (last.current.key !== key) last.current = { key, motion: key === null ? "sheet-close" : last.current.key ? "sheet-swap" : "none" };
  return last.current.motion;
}

/** Runs an Undo and says so when its write fails, instead of dropping the failure. */
function runUndo(undo: NonNullable<Toast["undo"]>, show: (toast: Omit<Toast, "id">) => void) {
  const fail = () => show({ text: "Couldn't undo. Try again." });
  try {
    const result = undo();
    if (result) result.then(undefined, fail);
  } catch {
    fail();
  }
}

/** The toast stays on screen for its exit, so it slides away instead of vanishing. */
function ToastView() {
  const { toast, clear, show } = useToast();
  const [shown, setShown] = useState<{ toast: Toast; leaving: boolean } | null>(toast ? { toast, leaving: false } : null);
  useEffect(() => {
    if (toast) { setShown({ toast, leaving: false }); return; }
    setShown(current => current && { ...current, leaving: true });
    const timer = window.setTimeout(() => setShown(current => current?.leaving ? null : current), 180);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const current = shown?.toast;
  return <div className="toast-region" role="status" aria-live="polite">
    {current && <div className={`toast${shown.leaving ? " leaving" : ""}`} key={current.id}>
      <span>{current.text}</span>
      {current.undo && <button type="button" disabled={shown.leaving} onClick={() => { const undo = current.undo!; clear(); runUndo(undo, show); }}>Undo</button>}
      {current.view && <button type="button" disabled={shown.leaving} onClick={() => { const view = current.view!; clear(); view(); }}>View</button>}
    </div>}
  </div>;
}
