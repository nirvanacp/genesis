# Genesis privacy policy

> **Draft.** This is a draft written from how the app works today. It is not legal advice and has not been reviewed by a lawyer. Text in square brackets, such as [ENTITY], must be filled in before publication.

Effective date: [EFFECTIVE DATE]

This policy explains what the Genesis Android app ("Genesis", "the app") does with your information. Genesis is published by [ENTITY] ("we", "us"). Contact: [CONTACT EMAIL].

## In short

- Genesis has no Genesis account, no Genesis server, no analytics and no ads. We do not receive your data.
- Genesis runs applets: screens built over websites you use. When you use a website through an applet, your browsing goes to that website, just as it would in a browser.
- Everything Genesis stores stays on your phone. Backups to Google are turned off.

## What stays on your phone

Genesis keeps these on your device, in storage only Genesis can read:

- the applets you install and their files;
- data that applets save, such as bookmarks, settings and screen state;
- data that an applet's own on-phone backend keeps in its database;
- website data: cookies, sign-ins, site storage and cache, kept by the website engine (Android System WebView, or Mozilla GeckoView when an applet uses it);
- your answers to permission prompts for each website, and app settings;
- an applet's debug log, only while you have turned it on (it turns off after seven days).

We never see this data. Uninstalling Genesis, or clearing its storage in Android settings, deletes it. Removing an applet deletes the data that applet saved; website sign-ins it shares with other applets stay until you sign out or clear the app's storage. Genesis turns off Android's cloud backup for the app, so this data is not copied to your Google account.

## What leaves your phone, and to whom

| When | What is sent | To whom |
| --- | --- | --- |
| You use a website inside an applet | Everything a browser would send: your requests, cookies, sign-in details you type, and your IP address | That website, under its own privacy policy |
| You install or update an applet, and every few hours while Genesis checks for applet updates | Requests for the applet's release files, with your IP address and the app's network headers | GitHub (github.com and its download hosts), under GitHub's privacy statement |
| An applet uses a backend on the internet that you set up | The requests that applet makes, which can include your applet data | The backend's operator, which is whoever you or the applet's author named |
| An applet shows notifications from its internet backend | Periodic background requests asking for new notifications | That applet's backend |
| Safe browsing checks of pages you open | Partial hashes of web addresses, or addresses, to check against lists of unsafe sites | Google, through Android System WebView's Safe Browsing |
| Android System WebView usage and crash statistics | Only if you allowed "Usage and diagnostics" in your phone's Google settings | Google, under Google's privacy policy |

Genesis does not sell, rent or share your information with anyone. It does not track you across apps.

## Camera, microphone, location, notifications and files

Genesis asks Android for these permissions only when a website or applet asks for them while you use it. Genesis passes the result to that website, for example a photo you take or your location, and the website handles it under its own policy. Genesis itself does not record or keep camera, microphone or location data. You can change each permission in Android settings, and Genesis remembers your answer for each website.

When you choose a file to upload or share, Genesis gives it only to the website or app you chose.

## Sharing a debug log

If you turn on an applet's debug log and choose **Share debug log**, Genesis opens Android's share sheet with the log file. The log can contain web addresses and page events of that applet. It goes only to the app and person you pick.

## Children

Genesis is not directed at children under [AGE, for example 13]. We do not knowingly collect information from children, and we do not collect information from anyone.

## Applets from other people

Anyone can build an applet. An applet you install from someone else runs inside your website sessions and can see the pages it is built for, like a browser extension. Only install applets from authors you trust. Their handling of data is their responsibility; Genesis does not send applet data to us.

## Your choices and rights

Because we hold no personal data about you, there is nothing for us to access, correct or delete. To delete everything Genesis stores, uninstall the app or clear its storage. For data a website holds, contact that website. For questions about this policy, write to [CONTACT EMAIL].

## Changes

We will post changes to this policy at [POLICY URL] and change the effective date above.
