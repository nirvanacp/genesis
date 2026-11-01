# X sharing and source confirmation

- Goal: Integrate native Share and preserve contextual editor entry.
- Changes: Connected the owned share sheet to optional native sharing. Registered Follow controls and implemented the inspected Repost confirmation flow. Source mutations reject recycled entities, duplicate requests and uncertain repeats. Provider mode cancels subsequent source confirmation steps.
- Decisions: Direct Reply URL with in_reply_to was inspected and reached a contextual editor. Editors remain website-owned. Source UI observations do not claim server persistence. Repost inverse and private-account state variants remain qualification gaps.
- Verification: X TypeScript and applet check/build passed. Live Reply open/cancel and Repost-menu inspection performed without submission. Native chooser acceptance and mutation read-back remain pending.
