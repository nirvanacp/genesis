import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { isDueNow, MULTI_ACCOUNT_ENABLED, ORIGIN, type Account } from "../model";
import { useAccounts, useItems, useNow } from "../store";
import { AccountDot, Icon, TopBar } from "../components/ui";
import { useMailNav } from "../components/mail";

/**
 * The account switcher. Every Google session signed in to this context has an index (`?authuser=N`);
 * switching opens that session's inbox in the same context, so Back returns to the previous
 * account. Adding a session goes through Google's own sign-in. Both hide when
 * `MULTI_ACCOUNT_ENABLED` is off.
 */
export function AccountsScreen() {
  const { accounts, current } = useAccounts();
  const { items } = useItems();
  const { navigate } = useNavigation();
  const mail = useMailNav();
  const now = useNow();

  const due = (account: Account) => items.filter(item => item.accountId === account.id && isDueNow(item, now)).length;
  const switchTo = (account: Account) => {
    if (account.id === current?.id) return;
    mail.inboxOf(account);
  };
  const addAccount = () => {
    const next = accounts.reduce((max, account) => Math.max(max, account.sessionIndex), -1) + 1;
    const target = `${ORIGIN}/mail/u/${next}/`;
    navigate({ url: `https://accounts.google.com/AddSession?continue=${encodeURIComponent(target)}`, context: "primary" });
  };

  return <div className="screen-frame">
    <TopBar title="Accounts" />
    <ScrollMemory className="screen">
      <ul className="plain-list card">
        {accounts.map(account => {
          const here = account.id === current?.id;
          const count = due(account);
          return <li key={account.id} className="account-row">
            <button type="button" className="list-button" aria-current={here ? "true" : undefined} disabled={!MULTI_ACCOUNT_ENABLED && !here} onClick={() => switchTo(account)}>
              <AccountDot color={account.color} />
              <span><strong>{account.name}</strong><small>{account.email}{count ? ` · ${count} due` : ""}</small></span>
              {here && <Icon name="check" />}
            </button>
            <button type="button" className="link-button" onClick={() => navigate({ screen: "account-setup", params: { id: account.id } })}>Edit</button>
          </li>;
        })}
        {!accounts.length && <li className="muted padded">Gmail Only records your account once Gmail shows it.</li>}
      </ul>
      {MULTI_ACCOUNT_ENABLED
        ? <button type="button" className="secondary block padded-x" onClick={addAccount}><Icon name="plus" /> Add another account</button>
        : <p className="hint padded">Gmail Only uses one Google account for now. Your reminders and to-dos already keep which account they came from.</p>}
    </ScrollMemory>
  </div>;
}
