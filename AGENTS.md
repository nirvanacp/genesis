# AGENTS.md

## What Genesis is

Genesis is an Android app that runs user-built applets. An applet is a native-feeling web UI, built with any web framework, over one or more live website sessions. Genesis keeps the websites' sessions, history and behavior; the applet owns the screens, data and rules the user asked for, and pages the applet does not customize appear as the website itself in the same session.

## Instruction sets

This file applies to every task in this repository. Two more instruction sets add to it, one for each development layer, and a coding agent is always working in at least one layer:

- A **Genesis developer** changes the platform: the Android shell in `android/app`, the Rust host in `android/native` and `crates/`, the shared packages under `packages/`, the build and tooling under `tools/`, and the shared applet-builder guidance under `factory/`. Follow `.developer/AGENTS.md` for this work. That file exists only in maintainer checkouts. When it exists, read it before starting any platform task, including questions, research, plans, reports and reviews: it defines where every generated platform document (plans, reports, research, reviews, docs) and change record goes, and they go nowhere else. Without it, this file is the complete instruction set for platform work; give platform plans and reports in the response, or ask the user where to save them, and never invent a location.
- An **applet builder** creates or customizes an applet: its website adapters, screens, application rules, stored data and optional backend. Applets live in the applets directory that `genesis.workspace.json` names (by default `applets/`, a nested repository cloned from the repository the config names), one directory per applet, named after its applet id. Follow `factory/AGENTS.md` for this work, and the applets directory's own `AGENTS.md` for its collection rules.

Decide the layer from the paths the task changes or is about. Questions, research, plans, reports and reviews belong to a layer too: a plan for shell or host changes is platform work even though it edits no code, and a review of an applet is applet work. A task that changes both layers follows both files for their respective files, and keeps platform capabilities independent of any single applet.

Before making changes, identify which project directories the task concerns; do not assume the current working directory is the target project's root. Keep changes within the requested scope, and run project-specific commands from the appropriate directory or through the workspace scripts.

After context compaction, re-read the instruction files of every layer the task touches before writing documents or code again. A conversation summary is not a source of rules.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit any `AGENTS.md` file unless the user explicitly asks you to update it.

## Repository map

| Path | What it is | Layer |
| --- | --- | --- |
| `android/app/` | Java shell: activity, launcher, context WebViews, website bar, native Genesis menu, service HTTPS client | Platform |
| `android/native/` | Rust host crate `genesis-host`: applets, contexts, documents, RPC, storage, services, compatibility, imports (JNI library `libgenesis_host.so`) | Platform |
| `crates/contracts/` | `genesis-contracts`: shell events and commands, document messages, manifest and bundle types, limits, error codes | Platform |
| `packages/core/` | `@genesis/core`: manifest validation, route matching, presentation coordinator, compatibility table, protocol types including page control (locators, read specifications, operations), bundle format, error codes (TypeScript, no DOM) | Platform |
| `packages/sdk/` | `@genesis/sdk`: the framework-free client (`connect`, contexts, watches, storage, services), the page agent and page modules (`/page`), the router helper (`/router`) and React bindings (`/react`) | Platform |
| `packages/applet-tools/` | `genesis-applet` CLI: create, check (including compatibility), build, device install, services, kit export | Platform |
| `tools/` | APK asset and native build pipeline, package index check, service helpers, git hooks | Platform |
| `factory/` | Applet-builder instructions, guides, skills and templates | Platform (shared guidance) |
| `applets/` | The applets directory, a nested repository (`hn-bookmarks`, `x-bookmarks`, `gmail-only`), with its port registry and backend launcher | Applets |
| `genesis.workspace.json` | Workspace layout: the applets directory (relative or absolute) and its repository. `npm run workspace -- path` prints the directory, `setup` clones it, `check` verifies the checkout | Platform |
| `genesis.packages.json` | Applets bundled into the APK, by directory name inside the applets directory | Platform |

The untracked root folders `notes/` and `.skills/` stay local to each machine and belong to the developer. Never commit them, and never save generated documents in them; documents go where the layer instructions say. The root `notes/` is unrelated to any notes folder in the developer workspace.

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

- Install the hooks once per clone, from the main checkout: `sh tools/git-hooks/install.sh`. It links `post-checkout` into the root repository and the branch name hooks (see **Branch names**) into the root and every nested repository. Every worktree of a repository uses that repository's hooks. Run it again after cloning or adding a nested repository.
- Before working in a worktree, check that it has each nested repository the main checkout has (the first entry of `git worktree list` is the main checkout). If one is missing, because the hook is not installed, the worktree was made with `--no-checkout` or the hook printed a warning, add it with `git -C <main>/<path> worktree add <worktree>/<path> <branch>`. Never symlink or copy a nested repository into a worktree; that shares one working tree between agents or splits its history.
- In a detached nested worktree, create a branch with `git -C <path> switch -c <branch>` before committing.
- An applets directory that `genesis.workspace.json` places outside the repository is not nested: `npm run workspace -- sync` links `applets/` in every worktree to that one checkout. For parallel applet work in that layout, make a worktree of the applets repository for each Genesis worktree and point that worktree's uncommitted `genesis.workspace.json` at it.
- `git worktree remove` deletes nested worktrees without checking them for changes. Commit the nested work first, remove the nested worktrees innermost first with `git -C <main>/<path> worktree remove <worktree>/<path>`, which refuses while changes are uncommitted, then remove the outer worktree. When a nested worktree was already deleted, run `git -C <main>/<path> worktree prune`.

### Worktree handoffs

- Carry a workspace reference alongside the problem identity from **Thread titles** when handing related work to another thread or agent. Include it near the top of newly created problem-specific documents that depend on a checkout, and refresh it when handing work back. A problem can span several worktrees; its spirit animal stays the same. Workspace details belong in the handoff, not the thread title. Do not assume another thread receives this conversation or can read a referenced file; include the reference in its opening message or task brief.
- For each repository needed by the next task, record its repository identity, machine, absolute checkout path, branch or detached HEAD, full handoff commit SHA, and working-tree state. Include nested repositories and an externally configured applets checkout when relevant; each has independent state. For a review, also specify the base commit and intended scope. State whether required commits are local-only or available from a remote branch. If work is uncommitted, list the affected tracked and untracked paths and explain how the receiving agent can access it; a commit SHA alone does not include it.
- Treat the reference as a snapshot. Before reviewing, editing, or resuming after compaction, verify the actual repository and checkout with `git worktree list`, `git -C <path> branch --show-current`, `git -C <path> rev-parse HEAD` and `git -C <path> status --short`, and read its applicable instructions. Confirm the handoff commit exists there. If HEAD or local changes differ, establish whether the task targets the recorded snapshot or the newer work before making dependent changes. A matching animal, branch name or current directory alone does not identify the right checkout.
- If the checkout is missing, inspect the repository's worktree list and the supplied references. Paths on another machine are location hints, not accessible checkouts. If the required commits or uncommitted changes remain unavailable, report what is missing and ask for access or an updated handoff; do not silently review or change another checkout. Do not push unpublished work merely to transfer context.
- Reuse the referenced worktree for fixes only when no other agent is writing there. Concurrent writers use separate worktrees based on the required handoff commit, following **Worktrees**, **Branches** and **Branch names**, including the nested repository setup. If a thread cannot change its bound workspace, use the appropriate workspace mechanism or hand back the required location; do not claim the thread moved. Never stash, discard or reset someone else's work to reuse a checkout.
- Keep machine names, absolute paths and private repository details in conversation handoffs or documents whose audience permits them. Public documents use portable repository, branch and commit references for public work only; supply local and private checkout details separately in the handoff. Follow the existing layer-specific document locations. Do not create a registry or extra document solely for workspace metadata, or retrofit historical documents unless requested.
- At completion or handoff, identify the checkout and resulting commits per repository, remaining uncommitted work, and whether another agent is still writing there or that state is unknown. Update the workspace reference when work moves or its branch changes, and preserve the problem identity.

## Questions and change requests

- When the user asks for an explanation, diagnosis, comparison or opinion, answer the question without editing code or other repository files. You may inspect relevant files and perform read-only checks to support the answer. Finding a bug or identifying a possible improvement does not by itself authorize a fix.
- Determine intent from the request and conversation context, rather than its grammatical form. "Why does this fail?" asks for an explanation; "Can you fix this failure?" requests a change. Suggestions and illustrative code in an answer are not permission to apply them.
- If it is unclear whether the user wants an explanation or an implementation, answer what you can through read-only investigation and ask for clarification before editing. Do not create incidental changelogs or commits for a question-only task.
- A request to write a plan, report, review or other document asks for that document, not only for an answer: save it where its layer's instructions say and commit it. It does not authorize code changes.
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

- Format titles as `{animal emoji} {Activity} {specific problem description}`. Aim for at most 40 visible characters and never exceed 50, including spaces and the emoji. Use one animal emoji at the beginning; do not add status emojis.
- Choose the activity from the current request: `Plan` for creating or revising plans; `Implement` for changing code, configuration or instructions; `Review` for evaluating plans, implementations or documents; `Research` for gathering information or exploring approaches; `Analysis` for explanations, diagnosis and reports. Keep the description concise and recognizable across related threads.
- A **spirit animal** identifies a problem, not a thread or activity. Maintain a stable `Problem ID` (a short descriptive identifier), `Problem` description and `Spirit animal` (emoji and animal name). Reuse the same identity across related threads, agents, documents and handoffs.
- Recover identity from the user's explicit assignment first, then a directly referenced source document or source thread when accessible, then the current conversation's established identity. Do not assume other threads or document contents are automatically in context. If sources disagree and the user has not resolved the conflict, ask which identity to preserve. Quoted examples are not assignments to the current problem.
- For a new problem with no existing assignment, choose an animal at random and state its identity once in the conversation. Avoid animals assigned to distinct problems in the available context; do not claim global uniqueness without a shared registry. An animal chosen by automatic title generation is provisional until the working agent checks for an existing assignment.
- Preserve the animal through activity changes, related follow-up questions, context compaction and forks. When an unrelated problem becomes the thread's primary task, recover its identity or assign a new one with a different animal. Do not relabel historical documents for the old problem.
- Include the identity near the top of newly created problem-specific plans, research briefs, reviews, analyses and change records, and in handoff messages for related threads. Use a compact block such as `Problem ID: session-recovery`, `Problem: Recover expired website sessions`, `Spirit animal: 🦦 Otter`. Follow the applicable document locations, filenames and public/private boundaries. Do not create a document or registry solely to store identity, or rewrite existing documents solely to add metadata, unless requested.
- Use available thread-renaming tools to align the title after recovering identity, when the activity or primary problem changes, and after context compaction or a fork. Preserve the established animal when regenerating a title for the same problem. If renaming tools are unavailable, provide the intended title without claiming it was applied. When starting a related thread, include its identity in the opening message so title generation can reuse it before reading files.

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

1. Before the first edit, settle the branches as **Branches** below describes. Then break substantial work into ordered logical steps with clear commit boundaries, organized by software component and dependencies. Work spanning multiple components or independently verifiable stages requires multiple steps and commits. Follow an existing plan when provided; otherwise, outline the steps in a brief progress update and proceed without requiring a separate planning task. A small, focused change may use one step and one commit.
2. Complete and verify each step using the applicable project checks and the **Testing and verification** rules, save requested documents and update the development records its layer requires (applet records under [factory/AGENTS.md](factory/AGENTS.md); platform records under the developer instructions when present), and commit it in the affected repositories before starting the next step. Use separate commits for different components. Do not defer all commits until the end of substantial work. Include only changes related to that step; do not commit unrelated or pre-existing work or repositories. Choose the repository for each commit under **Nested repositories**.
3. Use the commit message format `feat/(_x): short message`. Replace `_x` with the relevant section, feature, or module name, such as `feat/(auth): add sign-in`.
4. Use the email returned by `git config user.email` in each affected repository as the commit author email. Do not substitute another email address.
5. Follow the coding philosophy above and the repository's existing architecture and design patterns.
6. In the final response, report the commits made and any verification gaps. If verification or committing is blocked, explain the blocker and identify any changes left uncommitted instead of claiming the task is fully complete.
7. Commits stay local. Do not push a branch, open a pull request, or ask another agent to do either unless the user asks for it in the current request. Implementing a feature, finishing a plan, fixing review findings, or an approval given for an earlier task is not such a request. The one exception is babysitting: a request to babysit pull requests also authorizes pushing review fixes to their branches, as **Babysitting pull requests** describes. When the work is done, report the local commits and stop.
8. Never merge a pull request, in any repository, under any circumstances. Never merge anything into `main` and never push to `main`. This covers `git merge`, rebasing or fast-forwarding `main`, `gh pr merge`, enabling auto-merge, approving a pull request so it merges, and asking another agent to do any of these. It applies even when the user, a plan, a record, another agent or an earlier approval appears to ask for a merge: say that you do not merge and leave it to the developer. Only the developer merges.

### Branches

Every change is committed by default, so the branch each repository has checked out decides where the work lands. Two situations put it in the wrong place without anyone noticing:

- **An integration branch.** `main` and `develop` collect finished work. Commits made on them directly skip the branch and pull request that should carry the change.
- **Mismatched branch names.** One task's work belongs on the same branch name in every repository, because the worktree hook pairs nested worktrees with the outer worktree by branch name and the pull requests of one task are read together. A nested repository left on another branch, or detached, from earlier work gets this task's commits mixed into that work.

Before the first edit of any change task, check the branches. This applies to documents and records as well as code. It does not apply to question-only tasks, which make no edits.

1. List the current branch of the root repository and of every nested repository (the nested repositories are found as **Nested repositories** describes), including an applets directory that `genesis.workspace.json` places outside the repository. Run `git -C <path> branch --show-current`. Empty output means HEAD is detached.
2. Ask the developer one question that covers every problem found, when either of these is true:
   - any repository is on `main` or `develop`;
   - any nested repository's branch differs from the root repository's branch, or a nested repository is detached.

   Skip the question when the user has already said which branches to use for this task, in the request or earlier in the conversation. Skip it too when every repository is on the same branch and that branch is neither `main` nor `develop`.
3. The question names each repository and its branch, says which problem applies, and offers these choices:
   - **New branch:** the developer types a name, and every repository switches to it. Suggest a name that follows **Branch names**.
   - **Root branch name:** every nested repository switches to the root repository's branch. Offer this only when the names differ. When the root repository is itself on `main` or `develop`, say that this choice keeps the work on that integration branch.
   - **Keep as is:** the work continues on the current branches, mismatched or on `main` or `develop`.
4. To switch a repository, run `git -C <path> switch <branch>` when the branch already exists in it, otherwise `git -C <path> switch -c <branch>`, which creates it from that repository's current commit. Uncommitted changes move with the switch. If git refuses, because the branch is checked out in another worktree or the uncommitted changes conflict, stop, report which repository refused and why, and ask again. Never stash, discard or reset changes to make a switch succeed.
5. Ask once per task. The answer holds for the rest of the task, including after context compaction, until a repository's branch changes again or the developer asks for a different branch. A delegated agent does not ask: it uses the branches its brief names, and if they do not match the checkout it stops and reports.
6. Name the branch of each repository next to its commits in the final response.

#### Branch names

Every branch in every repository of the workspace is `main`, `develop` or `<type>/<name>`. Use the same name in every repository of one task.

- `<type>` is one of:
  - `feat` for new features and capabilities;
  - `fix` for bug fixes;
  - `proto` for prototypes and phase work, such as `proto/phase-14` (the developer instructions read the phase from this name);
  - `chore` for tooling, configuration, guidance and other maintenance;
  - `docs` for documents and records only;
  - `backup` for snapshots of another branch, such as `backup/phase-8-3cc5c29`.
- `<name>` uses lowercase letters, digits, `.`, `_` and `-`, and names the task in a few words, such as `feat/website-bar` or `fix/session-restore`. No further `/`.
- Branches that start with `sudo/` skip the rule. They are for the developer only: an agent creates one only when the user names that exact branch.

The hooks from `tools/git-hooks/install.sh` enforce the rule in every repository. `reference-transaction` refuses to create a branch with a bad name, through `git branch`, `git switch -c`, `git checkout -b` or `git worktree add -b`. Git does not show the new name of `git branch -m` to that hook, so `pre-push` also refuses to push a new remote branch with a bad name. Branches that already exist are never blocked.

When an agent creates a branch or worktree, it picks the type from the task and a name that follows the rule. When the developer asks for a name that breaks the rule, the agent suggests the closest valid name and asks which one to use. When a hook refuses a name, the agent chooses a valid name; it never bypasses a hook with `--no-verify`, `core.hooksPath` or a `sudo/` name of its own choosing.

#### Protected branches on GitHub

Rulesets on the `genesis` repository protect the integration branches. Only users with the Maintain or Admin role can change them:

- `main` accepts changes only through a pull request merged by a maintainer. Nobody pushes to it directly, and nobody force pushes or deletes it.
- `develop` takes merged pull requests and direct pushes from maintainers only. Nobody force pushes or deletes it.

These rules bind people. They do not widen what an agent may do: agents still never push to `main` or `develop` and never merge, as **Version control** says.

### Pushing and pull requests

Follow these steps only when the user asks you to push or to open pull requests. Every repository in the workspace has its own remote, so each one needs its own push and its own pull request. A request for "a pull request" or "the PR" means one for every repository that has work to publish, not only the repository the conversation started in.

1. Find the repositories that have work to publish. For the root and each nested repository, run `git fetch origin` and `git log --oneline origin/develop..HEAD` (with `git -C <path>` for a nested one). A repository whose current branch has no commits beyond `origin/develop` gets no push and no pull request. Name every repository and its commit count in a progress update before pushing.
2. Finish each layer's steps that must come before a pull request, such as the applet version raise and `genesis-applet publish` in [factory/AGENTS.md](factory/AGENTS.md). These steps can change other repositories: `npm version` also updates the root `package-lock.json`, and `publish` refuses a dirty Genesis checkout. Commit each change in the repository that owns the file. `publish` records the Genesis commit and warns until that commit is on a remote branch, so push the root repository first and refresh its remote-tracking branch before publishing. If a step is blocked in one repository, report the blocker and continue with the repositories it does not affect.
3. For each repository with commits, work on its own branch (never `main` or `develop`), push that branch to its own `origin`, and open a pull request against that repository's `develop`, its default branch. When several repositories have commits, open all their pull requests in the same task, in this order: the outer repository before the ones nested in it, a repository before the ones that depend on it, and a private record repository last, so it can name the public pull requests. A pull request that needs another repository's pull request says so in its description, for example "Needs nirvanacp/genesis#9".
4. If `git push` over SSH fails with `Permission denied (publickey)` while `gh auth status` shows a signed-in account, push over HTTPS with `gh`'s token for that one command: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push https://github.com/<owner>/<repo>.git <branch>`. Do not pass `-u` with a URL and do not change git config. A push to a URL leaves `origin/<branch>` stale, so fetch it back the same way into `refs/remotes/origin/<branch>`.
5. `gh` picks the GitHub repository from the directory it runs in. Run every `gh` command for a nested repository from inside that directory (`cd <path> && gh pr create --base develop ...`), or pass `--repo` with the repository named by `git -C <path> remote get-url origin`. A `gh pr create` run from the workspace root always targets the root repository.
6. If a pull request is already open for the branch, push to update it instead of opening another one.
7. A public repository's pull request, its description, and every comment or reply the agent posts on it must not mention or link a private repository. A private repository's pull request may name the public pull requests it records.
8. In the final response, give the pull request URL for each repository, or say that a repository had nothing to publish. If a push or pull request fails in one repository, report which one failed and why, and do not claim the others cover it.

### Babysitting pull requests

To babysit is to watch the open pull requests of the current task until their automated checks and bot reviews are settled, fixing what they find. It covers every pull request of the task, in every repository, and follows the rules above for each fix's repository, commit format and public boundary. A request to babysit authorizes pushing review fixes to those branches; it never authorizes a merge.

1. **Find the reviewers first.** Right after opening the pull requests, check which repositories have automated checks or a review bot, and babysit only those. Use `gh pr checks <n> --repo <repo>`, `gh pr view <n> --repo <repo> --json comments,reviews,statusCheckRollup` and the repository's `.github/workflows` triggers. Greptile shows a `Greptile Review` check and posts a summary comment within a few minutes of the pull request opening. A repository with neither, or whose workflows run only by hand (`workflow_dispatch`), has nothing to wait for. Say so, stop watching that pull request, and do not count it as pending.
2. **Wait only for automated signals.** Wait on checks and bot reviews. Never wait for human reviewers or human comments. A comment the user writes, such as their own review request, is not a task unless it asks for a change.
3. **Read every finding.** Greptile edits one summary comment in place and puts its findings in inline review comments.
   - Read both kinds: the summary with `gh api repos/<repo>/issues/<n>/comments`, the inline comments with `gh api repos/<repo>/pulls/<n>/comments`.
   - The summary's footer says "Last reviewed commit" and "Reviews (N)". A review counts for the current branch only when that commit is the pull request's head SHA.
   - The Confidence Score runs from 5/5 (merge) down to 0/5. Inline findings carry P0 (critical, must fix), P1 (high, should fix) or P2 (medium, consider).
4. **Act on each finding.** Check each finding against the code or document before changing anything.
   - **Valid:** fix it in the owning repository with that layer's checks and records, commit, and push to the pull request's branch.
   - **Wrong:** do not change the code.
   - **Either way:** reply on the inline thread (`gh api -X POST repos/<repo>/pulls/<n>/comments/<id>/replies -f body=...`). Name the fixing commit, or explain why the finding does not apply; Greptile learns from these replies.
   - Do not resolve threads, and do not react with 👍 or 👎 unless the user asks, because those reactions train the bot.
5. **Ask for a re-review after every pushed fix.** Greptile reviews a pull request when it opens and does not review later pushes on its own. After pushing fixes, comment `@greptile-apps review` on the pull request once. This handle starts a re-review in these repositories; Greptile's documentation names it `@greptileai`, so try that one if the first gets no reaction. A 👀 reaction means it is reviewing, 👍 that it finished, and 😕 that it failed, in which case comment again. Do not ask again while a review is running or when the last reviewed commit already equals the head SHA.
6. **Settle and hand back.** A pull request is settled when every check passes and the last reviewed commit equals its head SHA with no unanswered finding.
   - When every pull request is settled, stop watching them all and hand back.
   - In the final response, give each pull request's URL, head SHA, check state and review outcome, and list any repository left without a reviewer.
   - If the tools stay pending for a long time, or a check fails for reasons outside the change, report that instead of waiting.
   - Review comments handled while babysitting are not review documents and need no saved file.

## Versions

The developer controls every version that belongs to this project. Do not raise, lower or reset one on your own, even when a change seems to call for it. This includes:

- the versions of the packages and crates in this repository (`@genesis/core`, `@genesis/sdk`, `@genesis/applet-tools`, `genesis-contracts`, `genesis-host`) and the dependency ranges that point at them;
- the root `package.json` version. Applet versions are not platform versions: applet work follows `factory/AGENTS.md` for them;
- the Android `versionCode` and `versionName`;
- format and protocol numbers such as the manifest `schemaVersion`, the bundle format, the kit version and the service envelope version;
- the compatibility table in `packages/core/src/compat.ts` and its mirror in `crates/contracts` (manifest schema, bundle format, document protocol, adapter API, session state, import envelope, credential envelope, packages index);
- the version numbers that documentation and records quote for any of these.

If you think one of these should change, for example because a change breaks compatibility, ask the user before editing it. Say which version and why. Keep the current value until they answer. Third-party dependency versions follow the normal task scope.
