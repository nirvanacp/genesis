# Gmail Only

A Genesis applet over Gmail (https://mail\.google\.com) that turns emails into reminders and to-dos. It draws its own screen for every Gmail page: the inbox with a Today card, open emails with an "Add to…" button, compose with "Remind me if no reply", search, the drawer, and a To-do tab grouped by due date or by when items were added. Gmail keeps the mail; reminders, to-dos and snoozes are stored by the applet on the device.

The current state, routes, data and verification are in [.specs/current.md](.specs/current.md). Choices and their reasons are in [.specs/decisions.md](.specs/decisions.md).

## Build

```sh
npm install
npm run typecheck
npm run check
npm run build
npx genesis-applet dev install . --device <serial>
```

Sign in to Google in the applet the first time it opens. No service or secrets are needed.

## Multiple accounts

Add a second Google account from the account switcher (the avatar in the inbox header, or the drawer) with "Add another account". Each account keeps its own color and name, and its reminders and to-dos open their emails in that account. "Show in inbox" and "Show in To-do" in the account's setup choose where its items appear. To build without it, set `MULTI_ACCOUNT_ENABLED` to `false` in `src/model.ts`.

## Known limits

- No phone notifications. Due items show as the To-do badge, the Today card and "Back in your inbox".
- Gmail's mobile web has no snooze or scheduled send. Snooze archives the email and the applet brings it back to the top of the inbox when due.
- The message body is written and sent in Gmail's own compose ("Continue in Gmail"). The applet never sends mail on its own.
