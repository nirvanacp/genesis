# Here's how to generate thread title/names:

- Generate short title exactly about what problem does it solve.
- Use 3-5 words to describe. No more.
- Every conversation starts with an emoji
    - emoji is at the start of the title.
    - Yellow ball emoji (🟡) when a conversaton is started, but solution has not been found.
    - Purple ball emoji (🟣) when a bug is found, report is created, or a plan has been writeen.
    - Red ball emoji (🔴) when a asked to work on a fix or working on a fix. If it is starting to work on a fix at the startiing only, make it directly blue (skip yellow and red).
    - Blue ball emoji (🔵) when a fix has been implemented, but yet to be tested or verified.
    - Green ball emoji (🟢) when a bug is fix and a verification has been done.
    - If no file changes has been made or plans, reports, or reviews has not been done yet, the emoji is yellow ball
- Generate a new title form scratch whenever between the current message and previous message context is compressed. Or even better whenever a new conversation fork is created.

# Project layout

Hello world (to be added).

# Project Specific Skills

Project skills live in `.skills/`. This directory can contain third-party skills and skills written for this project. Each skill is defined by a `SKILL.md` file, usually at `.skills/<skill-name>/SKILL.md`.

### Discovery and use

- When the user asks to use a skill, search `.skills/` first, including nested directories. Match the requested name against directory names and the `name` and `description` in `SKILL.md`.
- Prefer a matching project skill over a skill with the same name installed elsewhere. If no project skill matches, check the other skills available in the current session. If the requested skill cannot be found, tell the user and continue any work that does not depend on it.
- Read the selected `SKILL.md` before applying it. Read referenced files only as needed, resolving relative paths from the skill's directory.
- Follow the skill's instructions within the user's requested scope. Tell the user briefly which skill you are using and why.
- A request to use a skill authorizes its use for that task. It does not enable automatic use in future tasks.

### Controls

Only the uncommented mode sections below are enabled. Treat all text inside HTML comments as inactive configuration, even if you can read it.

- Keep "Explicit use" enabled to use skills when the user names them, such as `$unslop` or "use the unslop skill".
- Uncomment "Automatic use" to also allow agents to select skills based on the task.
- Wrap either entire mode section in an HTML comment to disable it. If both are enabled, both forms of use are allowed. If neither is enabled, do not apply project skills until the user explicitly overrides this policy.
- These controls govern project skills. They do not override higher-priority system or developer instructions.

### Explicit use

When the user asks to use a specific skill, discover and read it using the rules above, then apply it. Merely discussing a skill or mentioning its name as an example does not request its use.

<!--
### Automatic use

For each task, inspect the names and descriptions of skills in `.skills/` for a relevant match. Apply a skill automatically when its stated use cases match the work. Read its full instructions before using it. Do not select a skill solely because a keyword matches.

Respect per-skill restrictions. A skill with `disable-model-invocation: true`, or an instruction requiring explicit invocation, may be used only when the user requests it, even while this mode is enabled.
-->

