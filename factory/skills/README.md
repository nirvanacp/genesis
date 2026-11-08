# Applet agent skills

Read [../AGENTS.md](../AGENTS.md) first. These skills cover applet work, not Genesis platform internals. Any coding agent can read a `SKILL.md` as plain instructions; installing it into an agent's skill registry is optional.

| Skill | Use when |
| --- | --- |
| [genesis-build-applet](genesis-build-applet/SKILL.md) | Creating an applet, or adding a context, page, screen or service to one |
| [genesis-customize-applet](genesis-customize-applet/SKILL.md) | Changing an applet's appearance or behavior, repairing adapter pages and regions, adding records or backend features |
| [genesis-verify-applet](genesis-verify-applet/SKILL.md) | Checking a change, diagnosing a failure, or preparing a handoff |
| [genesis-test-accounts](genesis-test-accounts/SKILL.md) | A journey needs a signed-in website session and the device is signed out; sign in with the operator's test accounts through scripts, without reading the values |

The first three use [product scope](../guides/product-scope.md): building establishes the app and its journeys, customizing preserves them while making the requested change, and verifying checks the delivered app against them. Read only the guides a task needs; they all travel with this kit.
