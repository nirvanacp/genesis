# AGENTS.md

## Monorepo layout and working scope

This codebase is a monorepo. The directory containing this `AGENTS.md` is the workspace root, with separate projects or codebases maintained in subdirectories beneath it. A task may concern one project, several related projects, or shared files at the root.

Genesis has two development layers. The Genesis platform owns the Android browser host, Rust lifecycle and capabilities, shared SDK, and platform tooling. Applets own website adapters, custom UI, application rules, data, and optional backends; for creating or customizing applets, also read and follow [factory/AGENTS.md](factory/AGENTS.md), including for applets currently stored under `factory/applets/`. Factory guidance supplies the applet-specific workflow while this file retains repository-wide rules. For work spanning both layers, follow each layer's instructions for its files and keep platform capabilities independent of individual applet features.

Genesis platform developers: when `.developer/AGENTS.md` exists, read and follow it for platform and shared work. It holds the developer workflow: document storage, phases, changelogs, plans, TODOs, factory guidance maintenance and thread titles. The `.developer/` workspace is private and absent from public copies of this repository; without it, follow this file and the applicable project instructions.

- Before making changes, identify which project directories the task concerns. Do not assume that the current working directory is the target project's root.
- Read any applicable `AGENTS.md` files within the target project. Follow its existing structure, dependencies, tooling, and conventions. Projects may use different languages, frameworks, and verification commands.
- Keep changes within the requested scope. Change shared files or sibling projects only when the task requires it, and account for any projects affected by a shared change.
- Run project-specific commands from the appropriate project directory, or use the repository's workspace tooling when available. Do not assume that a command run at the workspace root applies to every project.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit any `AGENTS.md` file unless the user explicitly asks you to update it.

## Questions and change requests

- When the user asks for an explanation, diagnosis, comparison or opinion, answer the question without editing code or other repository files. You may inspect relevant files and perform read-only checks to support the answer. Finding a bug or identifying a possible improvement does not by itself authorize a fix.
- Determine intent from the request and conversation context, rather than its grammatical form. "Why does this fail?" asks for an explanation; "Can you fix this failure?" requests a change. Suggestions and illustrative code in an answer are not permission to apply them.
- If it is unclear whether the user wants an explanation or an implementation, answer what you can through read-only investigation and ask for clarification before editing. Do not create incidental changelogs or commits for a question-only task.
- A follow-up question during an already authorized implementation does not cancel that authorization. Answer it and continue within the agreed scope unless the user asks you to pause, stop or change direction.

## Coding philosophy

### Prefer simple solutions

Choose the simplest solution that fully addresses the problem. Avoid unnecessary complexity and abstractions.

### Write readable code

Prioritize code that is easy to read, understand, and maintain:

- Separate distinct responsibilities into focused functions or modules when doing so improves readability.
- Follow the patterns and conventions already used in related code.
- Use clear, descriptive names for variables, functions, and modules.
- Follow established engineering practices to avoid unnecessary technical debt.

## Personal preferences

- If a request is too broad to complete reliably as one task, explain the scope concern and propose smaller, concrete tasks before proceeding.
- After solving a problem, briefly explain the implemented logic and any relevant algorithms in plain language.

## Testing and verification

- Do not create test files or modify existing tests unless the user explicitly asks for test coverage.
- You may run existing tests and perform other verification without adding or changing test files.
- After changing code, run the appropriate linting or verification command for the modified files before finalizing the work. If a required check cannot run, explain why and identify what remains unverified.

## Version control

For every user-requested change, commit the resulting changes as part of the task unless the user explicitly asks you not to commit. This applies to direct change requests and plan implementation, including code, configuration, documentation and agent-instruction changes of any size. A separate request to commit or a written plan is not required.

1. Before editing, break substantial work into ordered logical steps with clear commit boundaries, organized by software component and dependencies. Work spanning multiple components or independently verifiable stages requires multiple steps and commits. Follow an existing plan when provided; otherwise, outline the steps in a brief progress update and proceed without requiring a separate planning task. A small, focused change may use one step and one commit.
2. Complete and verify each step using the applicable project checks and the **Testing and verification** rules, update the development record its layer requires (applet records under [factory/AGENTS.md](factory/AGENTS.md); platform records under `.developer/AGENTS.md` when present), and commit it in the affected repositories before starting the next step. Use separate commits for different components. Do not defer all commits until the end of substantial work. Include only changes related to that step; do not commit unrelated or pre-existing work or repositories.
3. Use the commit message format `feat/(_x): short message`. Replace `_x` with the relevant section, feature, or module name, such as `feat/(auth): add sign-in`.
4. Use the email returned by `git config user.email` in each affected repository as the commit author email. Do not substitute another email address.
5. Follow the coding philosophy above and the repository's existing architecture and design patterns.
6. In the final response, report the commits made and any verification gaps. If verification or committing is blocked, explain the blocker and identify any changes left uncommitted instead of claiming the task is fully complete.

## Skills

Project skills live in `.skills/`. This directory can contain third-party skills and skills written for this project. Each skill is defined by a `SKILL.md` file, usually at `.skills/<skill-name>/SKILL.md`.

Read a skill's `SKILL.md` before applying it. Resolve any relative file references from that skill's directory.

### Apple design for custom apps

When designing, building, or changing a custom app, always use the relevant Apple design skills in `.skills/` to guide design choices and app development. Read the applicable skill instructions and use their guidance for the app's platform and framework.

Do not use skills installed outside the project's `.skills/` directory unless the user explicitly requests them. The `unslop` instruction below is an explicit exception.

Use the `unslop` skill whenever you write an explanation in your response. Prefer a project copy if one is available; otherwise, use an installed copy.
