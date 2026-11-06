# AGENTS.md

## What Genesis is

Genesis is an Android app that runs user-built applets. An applet is a native-feeling React UI over one or more live website sessions. Genesis keeps the websites' sessions and behavior; the applet owns the screens, data and rules the user asked for.

The repository has two development layers, and a coding agent is always working in one of them:

- A **Genesis developer** changes the platform: the Android shell in `android/app`, the Rust host in `android/native` and `crates/`, the shared packages under `packages/`, the build and tooling under `tools/`, and the shared applet-builder guidance under `factory/`. Follow `.developer/AGENTS.md` for this work. It also defines where development records go (plans, reports, reviews, research and changelogs under `.developer/`). That file exists only in the private checkout; without it, this file is the complete instruction set.
- An **applet builder** creates or customizes an applet: its website adapters, screens, application rules, stored data and optional backend. Applets live in their own directories (in this repository under `examples/`). Follow `factory/AGENTS.md` for this work, and `examples/AGENTS.md` for the example collection.

Decide the layer from the paths the task changes. A task that changes both layers follows both files for their respective files, and keeps platform capabilities independent of any single applet.

Before making changes, identify which project directories the task concerns; do not assume the current working directory is the target project's root. Keep changes within the requested scope, and run project-specific commands from the appropriate directory or through the workspace scripts.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit any `AGENTS.md` file unless the user explicitly asks you to update it.

## Repository map

| Path | What it is | Layer |
| --- | --- | --- |
| `android/app/` | Java shell: activity, launcher, WebViews, website sheet, native Genesis menu, service HTTPS client | Platform |
| `android/native/` | Rust host crate `genesis-host`: applets, documents, RPC, storage, services, surfaces, imports (JNI library `libgenesis_host.so`) | Platform |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, manifest and bundle types, limits, error codes | Platform |
| `packages/core/` | `@genesis/core`: manifest validation, route matching, navigation state machine, bundle format, error codes (TypeScript, no DOM) | Platform |
| `packages/sdk/` | `@genesis/sdk`: bridge, foreground runtime and React hooks, source runtime and driver | Platform |
| `packages/applet-tools/` | `genesis-applet` CLI: create, check, build, device install, services, kit export | Platform |
| `tools/` | APK asset and native build pipeline, package index check, service helpers | Platform |
| `factory/` | Applet-builder instructions, guides, skills and templates | Platform (shared guidance) |
| `examples/` | Example applets (`news.ycombinator.com`, `x.com`), their port registry and backend launcher | Applets |
| `genesis.packages.json` | Applets bundled into the APK | Platform |

## Nested repositories

This checkout contains two git repositories:

- The root repository at the workspace root. It is public. Its `.gitignore` excludes `/.developer/`, so the root repository never tracks that directory.
- `.developer/` is a separate repository with its own `.git`, remote, history and `git config user.email`. It is private to maintainers. It holds developer instructions, architecture notes and development records.

Treat them as one workspace with two commit targets:

- Choose the repository from each changed file's path. Files under `.developer/` commit in `.developer/`; every other file commits at the root.
- Run git for `.developer/` with `git -C .developer ...` from the workspace root, or from inside that directory. Never stage `.developer` paths from the root repository and never stage root paths from `.developer/`.
- A task that changes both makes at least one commit in each repository. Commit the root change first, then the record in `.developer/` that describes it, so the record can name the root commit.
- Use the same `feat/(_x): message` format and each repository's own `git config user.email` for the author.
- Report commits per repository in the final response.
- Files outside `.developer/` must not link to or quote `.developer/` content, except the pointer in this file. Public copies of the repository do not include `.developer/`.

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
2. Complete and verify each step using the applicable project checks and the **Testing and verification** rules, update the development record its layer requires (applet records under [factory/AGENTS.md](factory/AGENTS.md); platform records under `.developer/AGENTS.md` when present), and commit it in the affected repositories before starting the next step. Use separate commits for different components. Do not defer all commits until the end of substantial work. Include only changes related to that step; do not commit unrelated or pre-existing work or repositories. Choose the repository for each commit under **Nested repositories**.
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
