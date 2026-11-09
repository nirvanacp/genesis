# AGENTS.md

## What Genesis is

Genesis is an Android app that runs user-built applets. An applet is a native-feeling React UI over one or more live website sessions. Genesis keeps the websites' sessions, history and behavior; the applet owns the screens, data and rules the user asked for, and pages the applet does not customize appear as the website itself in the same session.

## Instruction sets

This file applies to every task in this repository. Two more instruction sets add to it, one for each development layer, and a coding agent is always working in at least one layer:

- A **Genesis developer** changes the platform: the Android shell in `android/app`, the Rust host in `android/native` and `crates/`, the shared packages under `packages/`, the build and tooling under `tools/`, and the shared applet-builder guidance under `factory/`. Follow `.developer/AGENTS.md` for this work. It also defines where platform development records go. That file exists only in maintainer checkouts; without it, this file is the complete instruction set for platform work.
- An **applet builder** creates or customizes an applet: its website adapters, screens, application rules, stored data and optional backend. Applets live in their own directories (in this repository under `examples/`). Follow `factory/AGENTS.md` for this work, and `examples/AGENTS.md` for the example collection.

Decide the layer from the paths the task changes. A task that changes both layers follows both files for their respective files, and keeps platform capabilities independent of any single applet.

Before making changes, identify which project directories the task concerns; do not assume the current working directory is the target project's root. Keep changes within the requested scope, and run project-specific commands from the appropriate directory or through the workspace scripts.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit any `AGENTS.md` file unless the user explicitly asks you to update it.

## Repository map

| Path | What it is | Layer |
| --- | --- | --- |
| `android/app/` | Java shell: activity, launcher, context WebViews, website bar, native Genesis menu, service HTTPS client | Platform |
| `android/native/` | Rust host crate `genesis-host`: applets, contexts, documents, RPC, storage, services, compatibility, imports (JNI library `libgenesis_host.so`) | Platform |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, manifest and bundle types, limits, error codes | Platform |
| `packages/core/` | `@genesis/core`: manifest validation, route matching, presentation coordinator, compatibility table, protocol types, bundle format, error codes (TypeScript, no DOM) | Platform |
| `packages/sdk/` | `@genesis/sdk`: bridge, foreground runtime, record store and React hooks, adapter runtime | Platform |
| `packages/applet-tools/` | `genesis-applet` CLI: create, check (including compatibility), build, device install, services, kit export | Platform |
| `tools/` | APK asset and native build pipeline, package index check, service helpers, git hooks | Platform |
| `factory/` | Applet-builder instructions, guides, skills and templates | Platform (shared guidance) |
| `examples/` | Example applets (`news.ycombinator.com`, `x.com`, `mail.google.com`), their port registry and backend launcher | Applets |
| `genesis.packages.json` | Applets bundled into the APK | Platform |

The untracked root folders `notes/` and `.skills/` stay local to each machine. Never commit them.

## Nested repositories

The root repository is public. A checkout can contain nested git repositories: directories with their own `.git`, remote, history and `git config user.email`, listed in the containing repository's `.gitignore`. There can be any number of them, nested at any depth, public or private.

- `git ls-files --others --directory` lists a repository's untracked directories; each one that contains `.git` is a nested repository. Treat a nested repository as private unless its own instructions or the user say it is public.
- Add a new nested repository's path to the containing repository's `.gitignore` before creating or cloning it.
- Treat the checkout as one workspace with one commit target per repository. Each file belongs to the innermost repository that contains it; choose the commit target from each changed file's path.
- Run git for a nested repository with `git -C <path> ...` from the workspace root, or from inside that directory. Never stage one repository's paths from another repository.
- A task that changes several repositories makes at least one commit in each. When a record in one repository describes a change in another, commit the change first and the record second, so the record can name the commit.
- Use the same `feat/(_x): message` format in every repository, with that repository's own `git config user.email` as the author.
- Report commits per repository in the final response.
- Files in a repository must not link to, quote or depend on the content of a private nested repository, except the pointer to the developer instructions in this file. Public copies of a repository do not include its nested repositories.

### Worktrees

A git worktree holds only the files its own repository tracks, so a new worktree starts without the nested repositories. The hook `tools/git-hooks/post-checkout` adds them: after `git worktree add`, it gives the new worktree its own worktree of every nested repository the main checkout has, at the same path and at every depth. Each nested worktree takes the outer worktree's branch name: an existing branch of that name is checked out, otherwise the hook creates it from the nested repository's current commit. When that branch is already checked out elsewhere, or the outer worktree is detached, the nested worktree is detached.

- Install the hook once per clone, from the main checkout: `ln -s ../../tools/git-hooks/post-checkout .git/hooks/post-checkout`. Every worktree of the repository uses it.
- Before working in a worktree, check that it has each nested repository the main checkout has (the first entry of `git worktree list` is the main checkout). If one is missing, because the hook is not installed, the worktree was made with `--no-checkout` or the hook printed a warning, add it with `git -C <main>/<path> worktree add <worktree>/<path> <branch>`. Never symlink or copy a nested repository into a worktree; that shares one working tree between agents or splits its history.
- In a detached nested worktree, create a branch with `git -C <path> switch -c <branch>` before committing.
- `git worktree remove` deletes nested worktrees without checking them for changes. Commit the nested work first, remove the nested worktrees innermost first with `git -C <main>/<path> worktree remove <worktree>/<path>`, which refuses while changes are uncommitted, then remove the outer worktree. When a nested worktree was already deleted, run `git -C <main>/<path> worktree prune`.

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

### Thread titles

- Write a 3 to 5 word title naming the problem, prefixed by one status emoji, and update it as work progresses: 🟡 investigating; 🟣 bug identified or plan, report or review complete, not yet implementing; 🔴 implementing a fix in an existing conversation; 🔵 fix implemented, needs verification (also the first title of a conversation that starts with an implementation request); 🟢 implemented and verified.
- Regenerate the title after context compaction and in each new fork.

## Skills

Project skills live in `.skills/`. This directory can contain third-party skills and skills written for this project. Each skill is defined by a `SKILL.md` file, usually at `.skills/<skill-name>/SKILL.md`.

Read a skill's `SKILL.md` before applying it. Resolve any relative file references from that skill's directory. The layer instructions name the skills their work uses.

Do not use skills installed outside the project's `.skills/` directory unless the user explicitly requests them. The `unslop` instruction below is an explicit exception.

Use the `unslop` skill whenever you write an explanation in your response. Prefer a project copy if one is available; otherwise, use an installed copy.

## Testing and verification

- Do not create test files or modify existing tests unless the user explicitly asks for test coverage.
- You may run existing tests and perform other verification without adding or changing test files.
- After changing code, run the appropriate linting or verification command for the modified files before finalizing the work. If a required check cannot run, explain why and identify what remains unverified. Each layer's instructions name its checks.

## Version control

For every user-requested change, commit the resulting changes as part of the task unless the user explicitly asks you not to commit. This applies to direct change requests and plan implementation, including code, configuration, documentation and agent-instruction changes of any size. A separate request to commit or a written plan is not required.

1. Before editing, break substantial work into ordered logical steps with clear commit boundaries, organized by software component and dependencies. Work spanning multiple components or independently verifiable stages requires multiple steps and commits. Follow an existing plan when provided; otherwise, outline the steps in a brief progress update and proceed without requiring a separate planning task. A small, focused change may use one step and one commit.
2. Complete and verify each step using the applicable project checks and the **Testing and verification** rules, update the development record its layer requires (applet records under [factory/AGENTS.md](factory/AGENTS.md); platform records under the developer instructions when present), and commit it in the affected repositories before starting the next step. Use separate commits for different components. Do not defer all commits until the end of substantial work. Include only changes related to that step; do not commit unrelated or pre-existing work or repositories. Choose the repository for each commit under **Nested repositories**.
3. Use the commit message format `feat/(_x): short message`. Replace `_x` with the relevant section, feature, or module name, such as `feat/(auth): add sign-in`.
4. Use the email returned by `git config user.email` in each affected repository as the commit author email. Do not substitute another email address.
5. Follow the coding philosophy above and the repository's existing architecture and design patterns.
6. In the final response, report the commits made and any verification gaps. If verification or committing is blocked, explain the blocker and identify any changes left uncommitted instead of claiming the task is fully complete.
7. Commits stay local. Do not push a branch, open a pull request, or ask another agent to do either unless the user asks for it in the current request. Implementing a feature, finishing a plan, fixing review findings, or an approval given for an earlier task is not such a request. When the work is done, report the local commits and stop.
8. Never merge a pull request, in any repository, under any circumstances. Never merge anything into `main` and never push to `main`. This covers `git merge`, rebasing or fast-forwarding `main`, `gh pr merge`, enabling auto-merge, approving a pull request so it merges, and asking another agent to do any of these. It applies even when the user, a plan, a record, another agent or an earlier approval appears to ask for a merge: say that you do not merge and leave it to the developer. Only the developer merges.

### Pushing and pull requests

Follow these steps only when the user asks you to push or to open pull requests. Every repository in the workspace has its own remote, so each one needs its own push and its own pull request.

1. Find the repositories that have work to publish. For the root and each nested repository, run `git fetch origin` and `git log --oneline origin/main..HEAD` (with `git -C <path>` for a nested one). A repository whose current branch has no commits beyond `origin/main` gets no push and no pull request.
2. For each repository with commits, work on its own branch (never `main`), push that branch to its own `origin`, and open a pull request against that repository's `main`. When several repositories have commits, open all their pull requests in the same task, the outer repository before the ones nested in it.
3. `gh` picks the GitHub repository from the directory it runs in. Run every `gh` command for a nested repository from inside that directory (`cd <path> && gh pr create --base main ...`), or pass `--repo` with the repository named by `git -C <path> remote get-url origin`. A `gh pr create` run from the workspace root always targets the root repository.
4. If a pull request is already open for the branch, push to update it instead of opening another one.
5. A public repository's pull request must not mention or link a private repository. A private repository's pull request may name the public pull requests it records.
6. In the final response, give the pull request URL for each repository, or say that a repository had nothing to publish. If a push or pull request fails in one repository, report which one failed and why, and do not claim the others cover it.

## Versions

The developer controls every version that belongs to this project. Do not raise, lower or reset one on your own, even when a change seems to call for it. This includes:

- the versions of the packages and crates in this repository (`@genesis/core`, `@genesis/sdk`, `@genesis/applet-tools`, `genesis-contracts`, `genesis-host`) and the dependency ranges that point at them;
- the root and applet `package.json` versions;
- the Android `versionCode` and `versionName`;
- format and protocol numbers such as the manifest `schemaVersion`, the bundle format, the kit version and the service envelope version;
- the compatibility table in `packages/core/src/compat.ts` and its mirror in `crates/contracts` (manifest schema, bundle format, document protocol, adapter API, session state, import envelope, credential envelope, packages index);
- the version numbers that documentation and records quote for any of these.

If you think one of these should change, for example because a change breaks compatibility, ask the user before editing it. Say which version and why. Keep the current value until they answer. Third-party dependency versions follow the normal task scope.
