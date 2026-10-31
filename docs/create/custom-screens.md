# Add controls and screens

[Learning path](../README.md) · After your first layout change

A custom app can do more than restyle a website. It can add controls beside website content and screens of its own.

## Choose where the feature belongs

| What you want | A useful place for it |
| --- | --- |
| Save this story | A button beside the story |
| Add a note | A dialog connected to the selected item |
| Browse saved stories | An app-owned Saved page |
| Switch between Feed and Saved | Genesis's native app sections |

Keep website login, forms, and account actions on their original pages. Your agent can preserve those flows while adding your own UI.

## Try this request

> Read factory/AGENTS.md. Add a Saved page to My reader, inside the same applet. Add a Save button to each supported story. Store URLs and titles on this device. Keep links and comments working. From Saved, open the story and let Back return to the same Saved filter. Keep applet ID my-reader. Show loading, empty, and error states separately.

This adds persistence. Read [Saved data](saved-data.md) before deciding what the Save button means.

## Check more than the happy path

Ask the agent to show:

1. A story saved from the live website.
2. That story appearing on Saved after reopening the page.
3. The correct source story opening from Saved.
4. Back returning to Saved.
5. A useful error if the records cannot be read.

Also try large text and long story titles. Controls should have clear labels and comfortable touch targets.

An empty library should mean "no saved records," not "the read failed."

## What the agent handles

The agent uses the public Genesis SDK for website changes and page navigation. React is optional for app-owned screens. You do not need to choose a frontend framework to describe this feature.

**Next:** [Choose where saved data lives](saved-data.md).
