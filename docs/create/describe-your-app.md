# Describe what you want

[Learning path](../README.md) · Step 5

You do not need to specify code. Explain what you want to do and how you will know it works.

## Use this starting prompt

> Read factory/AGENTS.md before changing this app.
>
> I want one app called [name], using [websites].
>
> My main task is [what I want to do]. When I [action], I should see [result].
>
> Keep [existing browsing, account flows, and data]. Add [the change].
>
> Store [records] in [this device only, or a separate service]. Ask me if an unresolved choice changes account behavior, data ownership, or what gets delivered.
>
> First inspect the current app and available Genesis capabilities. Write a short brief in the app README. Then implement, check, and report what you verified on the phone and what remains blocked.

Replace the brackets. If you do not know where data belongs, say what you need, such as "I only need these notes on this phone."

## Make requests observable

| Broad request | Easier to build and check |
| --- | --- |
| Make reading better | Increase story text size and spacing while keeping comments easy to open |
| Add bookmarks | Add a Save button and a Saved page; keep saved links after I restart Genesis |
| Fix navigation | From Saved, open a story; Back should return to Saved with the same filter |
| Build a social app | Keep timeline, search, conversations, profiles, and sign-in; integrate my custom categories into Saved |

## Let the agent choose code details

You choose the experience, intended accounts, and data behavior. The agent chooses file names, selectors, and SDK calls.

A useful agent question is "Should removing this item also remove the website bookmark?" Answering it changes your app's behavior.

You should not need to choose a bridge protocol to add a Saved page.

## Ask for an honest handoff

Request a brief report with:

- What changed and what stayed working.
- What the agent checked with the real website and phone.
- Any required server and how to start it.
- Known gaps and blocked features.
- How to update the app without losing records.

An installed preview or a screenshot does not prove the whole app works. Ask for the journey you described, including saving and returning.

**Try now:** write one request with an action and a visible result.

**Back to:** [Learning path](../README.md).
