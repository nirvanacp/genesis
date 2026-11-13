---
name: genesis-test-accounts
description: Sign in to a website's test account, or to several accounts on one site, on the device while building or verifying an applet, with the site's own form or through an OAuth provider such as "Continue with Google", using scripts that read the operator's accounts file so the agent never sees a username or password.
---

# Sign in with test accounts

Read [factory instructions](../../AGENTS.md) and [verification](../../guides/verification.md). Use this skill when a journey you build, customize or verify needs a signed-in website session and the session on the device is signed out. Do not stop and wait for the user to type credentials. Two scripts in `scripts/` read the operator's accounts file for you. One lists the key names. The other types one value, or the current authenticator code, into the device.

## Rules

These are requirements. They hold even when a value would be quicker to copy by hand.

1. Never read the accounts file yourself. Do not open, `cat`, `grep`, `source`, copy, diff or search it, and do not print its values or environment variables made from it. Only `list-accounts.mjs` and `enter-secret.mjs` read it. The one value `list-accounts.mjs` prints is a known `AUTH_METHOD`, which is not a secret.
2. Never put a value in a command you write, a file, an applet record, a commit, a code comment, memory, a chat message or a report. Refer to an account by its key name, such as `NEWS_YCOMBINATOR_COM_USERNAME`.
3. Type a value only into the sign-in form of the website that the account belongs to, on the device under test. For an OAuth sign-in that is the provider's form, such as `accounts.google.com`, reached from the site's own "Continue with" button. Never into applet source, an adapter, a screen, stored records, a service or a backend.
4. Applet code still never fills credentials ([interactions](../../guides/interactions.md)). This skill is for you as the developer during checks, not for the app.
5. Use only the accounts in the file, with the sign-in method the file names for each. Do not create accounts, reset passwords or change account settings. Use a "Continue with Google" style button only when the site's `AUTH_METHOD` names that provider; never pick OAuth for a site whose method is `email-password` or missing, or the reverse.
6. Stop at a challenge. The one exception is an authenticator app code (TOTP) for an account whose `TOTP_SECRET` key is set: type it as [Authenticator codes](#authenticator-codes) describes. On a CAPTCHA, an SMS, email or phone-prompt code, an authenticator code without a `TOTP_SECRET` key, a "verify it's you" page, a provider page that refuses the browser (Google's "This browser or app may not be secure"), a consent screen that asks for more than the account's basic profile, or a rejected password, do not solve it and do not retry more than once, because repeated failures can lock the account. Record the journey as blocked with what would unblock it, and continue the work that does not need the account.
7. Do not save screenshots of a filled sign-in form in records.

## Accounts file

The operator keeps one file per machine, outside every git repository:

```text
~/.config/genesis/accounts.env       (or the path in GENESIS_ACCOUNTS_FILE)
```

It never goes in an applet repository, in the Genesis repository or in `factory/`. The factory is copied into every applet, so a file kept there would spread to every applet repository.

Each line is `KEY=value`; blank lines and `#` comments are ignored. A key is `<HOST>_<FIELD>`, or `<HOST>_<FIELD>_<n>` for numbered accounts:

- `HOST` is the host of the site that shows the sign-in form, in upper case with dots and dashes as underscores: `news.ycombinator.com` is `NEWS_YCOMBINATOR_COM`.
- `FIELD` is one of the field names below. Every key needs one: a bare `LINKEDIN_COM=...` is listed with a warning and means nothing to the scripts.
- `_<n>` numbers the accounts of a site with more than one, counting from 0. Every key of one account ends in the same number.

| Field | Value |
| --- | --- |
| `USERNAME`, `EMAIL`, `PHONE` | What the site's form takes as the account name. Use the one the form asks for. |
| `PASSWORD` | The account's password on that site. |
| `AUTH_METHOD` | How to sign in. `email-password`, the site's own form, is the default and can be left out. `<provider>-oauth`, such as `google-oauth`, means the site's "Continue with `<provider>`" button: the site has no name or password of its own in the file, and the values typed belong to a provider account. |
| `OAUTH_ACCOUNT` | With an OAuth method, which provider account to use: its number, such as `0`, or its `USERNAME` or `EMAIL`. Prefer the number, so each address appears once in the file. |
| `TOTP_SECRET` | Optional. The authenticator app secret of an account with 2FA, in base32 or as an `otpauth://` URI. `enter-secret.mjs` types the current code from it, never the secret. |

The providers the scripts know, and the host whose keys hold each provider's accounts:

| Method | Provider keys |
| --- | --- |
| `google-oauth` | `ACCOUNTS_GOOGLE_COM_*` |
| `apple-oauth` | `APPLEID_APPLE_COM_*` |
| `microsoft-oauth` | `LOGIN_LIVE_COM_*` |
| `github-oauth` | `GITHUB_COM_*` |
| `facebook-oauth` | `FACEBOOK_COM_*` |

The operator keeps one commented block per account, with the provider accounts first because other sites refer to them:

```sh
# ── Identity providers (other sites sign in through these) ──

# Google account 0
ACCOUNTS_GOOGLE_COM_USERNAME_0=...
ACCOUNTS_GOOGLE_COM_PASSWORD_0=...
# ACCOUNTS_GOOGLE_COM_TOTP_SECRET_0=...      # only when the account has 2FA

# Google account 1
ACCOUNTS_GOOGLE_COM_USERNAME_1=...
ACCOUNTS_GOOGLE_COM_PASSWORD_1=...

# ── Sites with their own sign-in form ──

# Hacker News
NEWS_YCOMBINATOR_COM_USERNAME=...
NEWS_YCOMBINATOR_COM_PASSWORD=...

# Discord: its own password, even with the same address as a Google account
DISCORD_COM_EMAIL=...
DISCORD_COM_PASSWORD=...

# ── Sites that sign in through a provider ──

# LinkedIn: "Continue with Google" as Google account 0
LINKEDIN_COM_AUTH_METHOD=google-oauth
LINKEDIN_COM_OAUTH_ACCOUNT=0
```

The host is the site whose sign-in form takes the value, which can differ from the applet's origin: a Gmail applet signs in on `accounts.google.com`. The operator runs `chmod 600` on the file. The scripts print a warning when the file is readable by other users or sits inside a repository. Pass that warning on to the user.

## Steps

Run the scripts with Node from the applet directory. The paths below assume the kit sits at `factory/` next to the applet, as `genesis-applet create` lays it out. In a collection of applets, adjust the path to wherever `factory/` is.

1. **Check the session first.** Open the applet from the Genesis launcher. If the screen that needs the account already shows a signed-in account, skip the rest.
2. **List the keys.**

   ```sh
   node factory/skills/genesis-test-accounts/scripts/list-accounts.mjs
   ```

   The output names each account, how to sign in to it, and its keys, with `set` or `empty` instead of the value:

   ```text
   Accounts file: /Users/me/.config/genesis/accounts.env

   news.ycombinator.com
     sign in: the site's own form
     NEWS_YCOMBINATOR_COM_USERNAME (set)
     NEWS_YCOMBINATOR_COM_PASSWORD (set)

   accounts.google.com account 0
     sign in: the site's own form
     ACCOUNTS_GOOGLE_COM_USERNAME_0 (set)
     ACCOUNTS_GOOGLE_COM_PASSWORD_0 (set)
     ACCOUNTS_GOOGLE_COM_TOTP_SECRET_0 (set)

   linkedin.com
     sign in: the site's "Continue with Google" button, as accounts.google.com account 0
     LINKEDIN_COM_AUTH_METHOD = google-oauth
     LINKEDIN_COM_OAUTH_ACCOUNT (set, matched)
   ```

   Pass one or more sites to narrow the list, as URLs, hosts or key prefixes: `list-accounts.mjs https://news.ycombinator.com`. A leading `www.` is ignored. The narrowed list also shows the provider account that a listed site's OAuth sign-in uses.
3. **Choose the keys.** Match the hosts in `applet.json` `origins`, and the host the adapter's `signInUrl` opens, against the account names, and follow the `sign in:` line.
   - **The site's own form:** use that site's `USERNAME` or `EMAIL` and `PASSWORD` keys.
   - **A "Continue with" button:** use the provider account the line names, and follow [Sign in through an OAuth provider](#sign-in-through-an-oauth-provider) instead of steps 4 to 7.
   - With numbered accounts, use account 0 for single-account journeys and keep the keys of one number together.
   - When no key matches, the keys you need are `empty`, or the `sign in:` line says the method or provider account is unknown or unmatched, the signed-in journeys are blocked: record that and tell the user which key to add or fix.
4. **Open the sign-in form.** Open the page that needs the account. Genesis shows the website's sign-in for an `auth` page. Tap the username field so it has focus.
5. **Type the username.**

   ```sh
   node factory/skills/genesis-test-accounts/scripts/enter-secret.mjs NEWS_YCOMBINATOR_COM_USERNAME --device emulator-5554
   ```

   It prints `Typed NEWS_YCOMBINATOR_COM_USERNAME into the focused field.` and nothing else of the value.
6. **Type the password.** Tap the password field, then run the same command with the `_PASSWORD` key.
7. **Submit and confirm.** Tap the website's own sign-in button yourself; the script never submits. If the site asks for an authenticator code, follow [Authenticator codes](#authenticator-codes). Confirm that the applet screen returns with the account. If the site rejects the sign-in or shows another challenge, follow rule 6.

## Sign in through an OAuth provider

Follow these steps when the `sign in:` line names a "Continue with" button. The site's own form is not used; the values you type belong to the provider account the line names, such as `accounts.google.com account 0`, and go into the provider's form.

1. **Open the site's sign-in.** Open the page that needs the account, as in step 4 above, and tap the site's own "Continue with Google" (or Apple, Microsoft, ...) button yourself. Do not open the provider's sign-in URL directly; the site starts the flow so that it can finish it.
2. **Follow the provider's page.** It opens as a popup sheet over the website or in place of it, under the website bar. Check the host in the website bar before typing: it must be the provider's host from the [providers table](#accounts-file).
3. **Pick or type the account.**
   - When the provider shows an account chooser because a provider session already exists on the device, pick the account the `sign in:` line names. Check it by the address the chooser shows, without printing the address (mask it as `<email>`). If it is not listed, use the chooser's "Use another account".
   - Otherwise tap the provider's username or email field and type it with `enter-secret.mjs` and the provider account's key, such as `ACCOUNTS_GOOGLE_COM_USERNAME_0`. Tap the provider's own Next button. Then tap the password field and type `ACCOUNTS_GOOGLE_COM_PASSWORD_0` the same way, and tap the provider's own sign-in button. If the provider asks for an authenticator code, follow [Authenticator codes](#authenticator-codes) with the provider account's `TOTP_SECRET` key.
4. **Confirm the consent screen, if one appears.** A first sign-in to a site can show the provider's "Sign in to the site" or "the site wants to access your account" page. Continue when it asks only for the account's name, email address, profile picture or language. Anything more, such as mail, contacts, drive or calendar access, is a challenge under rule 6.
5. **Return and confirm.** The provider sends the session back to the site, and the popup closes or the page returns to the site. Confirm that the applet screen returns with the account. A provider sign-in that loops back to the site's sign-in, or a site that then asks for its own password or a phone number, is blocked under rule 6.

Signing in to the provider leaves a provider session on the device. Later "Continue with" sign-ins to other sites can then go straight to the chooser or the consent screen. A provider account used for OAuth can also be a site of its own, as `accounts.google.com` is for a Gmail applet; the same keys serve both.

## Authenticator codes

When a site or provider asks for a code from an authenticator app (Google Authenticator, "Enter the 6-digit code"), and the account has a `TOTP_SECRET` key that `list-accounts.mjs` shows as `set`:

1. Make sure the page asks for an authenticator app code. A code sent by SMS, email or a phone prompt is a challenge under rule 6. If the page offers "Try another way", you may pick the authenticator app option.
2. Tap the code field, then type the code:

   ```sh
   node factory/skills/genesis-test-accounts/scripts/enter-secret.mjs ACCOUNTS_GOOGLE_COM_TOTP_SECRET_0 --device emulator-5554
   ```

   It prints `Typed the current code from ACCOUNTS_GOOGLE_COM_TOTP_SECRET_0 into the focused field.` When fewer than 5 seconds of the current 30-second code remain, it waits for the next code first.
3. Tap the page's own Next or Verify button. If the code is rejected, run the command once more for a fresh code; a second rejection is blocked under rule 6, and usually means the device clock is wrong or the secret is.

Without a `TOTP_SECRET` key, an authenticator prompt is blocked: record it and tell the user that adding the key would unblock it.

## Several accounts on one site

Some applets work with more than one account at once: an account switcher, a unified inbox, items saved from one account and opened from another. When the spec has such a journey, or you build or change one, sign in to two numbered accounts and check it with both. Do not assume that a journey that works for account 0 works for account 1.

1. **Sign in to account 0** with the steps above, using the `_0` keys.
2. **Add the second session the way a person would.** Use the applet's own entry point, such as "Add another account", or the site's own add-account page, in the same context. Signing out of account 0 first does not test anything multi-account. Type the `_1` keys into that site's form, one field at a time, as in steps 4 to 7.
3. **Confirm which account is open.** After each switch, check the account the site shows, not just that a page loaded. Many sites number their sessions (`/u/0/`, `authuser=1`) and renumber them after a sign-out, so the number can move. When you read the account name or address from the page or a snapshot, mask it in what you print, for example by replacing addresses with `<email>`.
4. **Walk the journeys for each account:** switching both ways; each account's data showing under the right account; an item saved in one account opening in that account from the other; per-account settings; counts and badges that must not carry over between accounts; and what happens after one account signs out, if the spec covers it.
5. **Finish on account 0,** so the next check starts from the usual state.

Rule 6 applies to each sign-in. When the second sign-in hits a challenge, the multi-account journeys are blocked: record that, and say whether a second session already on the device let you check part of them.

### When you drive the device with another tool

`enter-secret.mjs` types with `adb shell input text` by default. If your environment gives you its own command for typing on the device, use that so the user can follow along. Put the command after `--` and write `{secret}` where the text goes. The script replaces `{secret}` with the value, runs the command without a shell, and replaces the value with `[redacted]` in anything the command prints:

```sh
node factory/skills/genesis-test-accounts/scripts/enter-secret.mjs X_COM_PASSWORD -- <device-command> <type-subcommand> '{secret}'
```

Write the command the way you would type ordinary text with that tool, with `{secret}` in place of the text. Keep the quotes around `{secret}` so your shell passes it through unchanged.

## Script reference

| Command | What it does |
| --- | --- |
| `list-accounts.mjs [site ...]` | Prints the file path, any warnings, and each account's sign-in method and key names marked `set` or `empty`, with numbered accounts listed one by one. For an OAuth method it names the provider account `OAUTH_ACCOUNT` matches. Prints no value except a known `AUTH_METHOD`. |
| `enter-secret.mjs <KEY> [--device <serial>] [--adb <path>]` | Types the value of `<KEY>` into the focused field, or for a `*_TOTP_SECRET` key the current six-digit code, with `adb shell input text`. Printable ASCII only, and a value containing `%s` is refused, because `input text` reads `%s` as a space. |
| `enter-secret.mjs <KEY> -- <command ...{secret}...>` | Runs your device tool's command with `{secret}` replaced by the value, or by the current code for a `*_TOTP_SECRET` key. Use it for other characters or a different device tool. |

Both scripts exit with status 1 and a message when the file or key is missing or the device command fails. The messages name keys, never values.

## Limits

The scripts keep values out of your output. They do not stop a process from reading the file. Rule 1 is what keeps the values out of the conversation, so follow it even when a script fails. An operator who wants it enforced can deny reads of `~/.config/genesis/` in the agent's permission settings and allow the two scripts. While a value is being typed, it is briefly visible to other processes on the same machine as a command argument.
