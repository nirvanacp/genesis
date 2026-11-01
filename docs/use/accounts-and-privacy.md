# Accounts, permissions, and privacy

[Learning path](../README.md) · Before using new custom code

A Genesis app runs over a live website. Its custom code may read or change content on the pages it adapts. Only install code you trust.

## Keep sign-in on the website

Enter your password in the website's sign-in flow. Do not paste passwords, cookies, or login tokens into a coding prompt or the app's source files.

Website sessions remain in Genesis's browser. A separate backend connection uses its own credential; Genesis does not forward website cookies to it through the service API.

Do not assume separate applets provide separate website accounts or fully isolated browsing sessions.

## Understand the app's access

An app declares its website origins, such as `https://news.ycombinator.com`, and the Genesis capabilities it needs.

| Capability | Why an app might need it |
| --- | --- |
| Website content access, called `dom` | Change a layout or add controls |
| Navigation policy | Manage supported website navigation |
| Storage | Keep applet records on this device |
| Services | Send applet data to a configured backend |

Ask your agent to explain any new origins, capabilities, or services during an update. A permission declaration is not a guarantee that all custom code is safe or that all its network traffic is confined.

## Decide before sending data elsewhere

For a custom collection, ask:

- What exactly gets saved, such as a URL, text snapshot, or note?
- Does it stay on this device or go to a server?
- Who runs that server, and which accounts can read it?
- How can I back it up or delete it?

A saved snapshot may remain after the original website edits or removes a post. Opening the live page shows the current source content if it is still available.

## Share useful bug reports

Include steps and error text. Remove private page contents, passwords, tokens, and account details from screenshots and logs before sharing.

**Next:** [Describe an app change](../create/describe-your-app.md), or [learn where data lives](../create/saved-data.md).
