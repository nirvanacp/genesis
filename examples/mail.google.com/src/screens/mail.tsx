import type { ReactNode } from "react";
import { useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import type { ViewId } from "../adapter/read";
import { INBOX } from "../model";
import { Icon, IconButton, LoadError, Logo, Notice, Skeleton } from "../components/ui";
import { CONTEXT, useMailNav, useMailView } from "../components/mail";
import { ListScreen } from "./list";
import { ConversationScreen } from "./conversation";
import { ComposeScreen } from "./compose";
import { DrawerScreen } from "./drawer";

/**
 * The route screen for every Gmail page. Gmail's mobile web is one page whose hash picks a view:
 * a list, a conversation, compose, the menu or Gmail's settings. The adapter reports which view
 * is visible; the hash says which list or thread it shows. Any other view gets a themed screen
 * that offers Gmail itself, so no Gmail page is ever left without a Gmail Only screen.
 */
export function MailScreen() {
  const page = usePage(CONTEXT);
  const visible = useRecord<{ view: ViewId | null; hash: string }>("view", null, CONTEXT)?.data;
  const { view } = useMailView();

  if (page.status === "auth") return <SignInScreen />;
  if (page.status === "error" && !visible) return <Frame><LoadError error={page.error} /></Frame>;

  // The visible view decides; before Gmail has drawn one, the hash picks the screen to show.
  const kind = visible?.view ? kindOf(visible.view) : view.kind === "other" ? "loading" : view.kind;

  switch (kind) {
    case "list": return <ListScreen list={view.kind === "list" || view.kind === "conversation" ? view.list : INBOX} />;
    case "conversation": return view.kind === "conversation"
      ? <ConversationScreen threadId={view.threadId} list={view.list} />
      : <Frame><Skeleton label="Loading email" kind="text" rows={5} /></Frame>;
    case "compose": return <ComposeScreen />;
    case "menu": return <DrawerScreen />;
    case "settings": return <GmailSettingsScreen />;
    case "loading": return <Frame><Skeleton label="Loading Gmail" /></Frame>;
    default: return <OtherScreen />;
  }
}

function kindOf(view: ViewId | null): "list" | "conversation" | "compose" | "menu" | "settings" | "loading" {
  switch (view) {
    case "tl_": return "list";
    case "cv_": return "conversation";
    case "co_": return "compose";
    case "mn_": return "menu";
    case "pr_": return "settings";
    default: return "loading";
  }
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="screen-frame"><div className="screen">{children}</div></div>;
}

/** Shown while Gmail asks the person to sign in; the sign-in itself happens on Google's page. */
function SignInScreen() {
  const { viewWebsite } = useNavigation();
  return <div className="screen-frame">
    <div className="screen centered">
      <div className="welcome">
        <Logo />
        <h1>Sign in to Gmail</h1>
        <p>Gmail Only works over your own Gmail session. Sign in on Google's page; your reminders and to-dos stay on this device.</p>
        <button type="button" className="accent block" onClick={() => viewWebsite()}>Sign in with Google <Icon name="external" /></button>
      </div>
    </div>
  </div>;
}

/** Gmail's own settings page (`#pr`). Gmail Only keeps its own settings separate. */
function GmailSettingsScreen() {
  const { viewWebsite, navigate } = useNavigation();
  const mail = useMailNav();
  return <div className="screen-frame">
    <header className="top-bar">
      <IconButton icon="back" label="Back to inbox" onClick={() => mail.inbox("replace")} />
      <h1>Gmail settings</h1>
    </header>
    <div className="screen">
      <div className="card settings-links">
        <button type="button" className="list-button" onClick={() => viewWebsite()}>
          <span className="tile neutral"><Icon name="mail" /></span>
          <span><strong>Signature, vacation reply and more</strong><small>Opens Gmail's settings page</small></span>
          <Icon name="external" />
        </button>
        <button type="button" className="list-button" onClick={() => navigate({ screen: "settings" })}>
          <span className="tile todo"><Icon name="settings" /></span>
          <span><strong>Gmail Only settings</strong><small>Reminders, to-dos, swipe and theme</small></span>
          <Icon name="right" />
        </button>
      </div>
      <p className="hint padded">Gmail's settings change your Google account, so Gmail Only opens them in Gmail rather than redrawing them.</p>
    </div>
  </div>;
}

/** Any Gmail view Gmail Only does not know yet. */
function OtherScreen() {
  const { viewWebsite } = useNavigation();
  const mail = useMailNav();
  return <div className="screen-frame">
    <header className="top-bar">
      <IconButton icon="back" label="Back to inbox" onClick={() => mail.inbox("replace")} />
      <h1>Gmail</h1>
    </header>
    <div className="screen">
      <Notice title="This part of Gmail opens in Gmail" icon="mail">
        <p>Gmail Only doesn't have its own screen for this page yet.</p>
        <div className="row-buttons">
          <button type="button" className="accent" onClick={() => viewWebsite()}>Open in Gmail <Icon name="external" /></button>
          <button type="button" className="secondary" onClick={() => mail.inbox("replace")}>Go to inbox</button>
        </div>
      </Notice>
    </div>
  </div>;
}
