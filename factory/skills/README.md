# Applet agent skills

Start with [explicit navigation](../guides/navigation.md) for SDK 0.5.1/tools 0.5.0, schema 3/API 4, route coverage and marked website actions. Existing schema-2/API-3 packages retain compatibility.

Read [../AGENTS.md](../AGENTS.md) first. These skills guide work on applets, not Genesis internals. They can be read directly by any coding agent; installation into a particular agent's skill registry is optional and agent-specific.

| Skill | Use when |
| --- | --- |
| [genesis-build-applet](genesis-build-applet/SKILL.md) | Creating an applet, adding a source or page, or translating a product idea into an applet. |
| [genesis-customize-applet](genesis-customize-applet/SKILL.md) | Changing appearance or behavior, repairing selectors, adding applet records or backend features. |
| [genesis-verify-applet](genesis-verify-applet/SKILL.md) | Checking a change, diagnosing lifecycle or data errors, or preparing a handoff. |

Read only the guides needed by the task. All guides travel with this kit. The repository's current-phase plans and native implementation files are for platform maintainers; they are not prerequisites for ordinary applet work.

All three skills use [product scope and clarification](../guides/product-scope.md). Build establishes the intended app and its journeys, customization preserves them while making the requested change, and verification checks the delivered experience against them. Ask before unresolved material product choices; do not require a routine approval gate or ask the user to design technical internals.

All three workflows use [the isolated source/foreground contract](../guides/isolated-applets.md). Build declares route coverage before extraction, customization updates the contract and owned renderer together, and verification checks hidden-source isolation plus website-provider return.
