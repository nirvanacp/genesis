# AGENTS.md

## Monorepo layout and working scope

This codebase is a monorepo. The directory containing this `AGENTS.md` is the workspace root, with separate projects or codebases maintained in subdirectories beneath it. A task may concern one project, several related projects, or shared files at the root.

Genesis has two development layers. The Genesis platform owns the Android browser host, Rust lifecycle and capabilities, shared SDK, and platform tooling; maintain these under this file's instructions. Applets own website adapters, custom UI, application rules, data, and optional backends; for creating or customizing applets, also read and follow [factory/AGENTS.md](factory/AGENTS.md), including for applets currently stored under `factory/applets/`. Factory guidance supplies the applet-specific workflow while this file retains repository-wide rules. For work spanning both layers, follow each layer's instructions for its files and keep platform capabilities independent of individual applet features.

- Before making changes, identify which project directories the task concerns. Do not assume that the current working directory is the target project's root.
- Read any applicable `AGENTS.md` files within the target project. Follow its existing structure, dependencies, tooling, and conventions. Projects may use different languages, frameworks, and verification commands.
- Keep changes within the requested scope. Change shared files or sibling projects only when the task requires it, and account for any projects affected by a shared change.
- Run project-specific commands from the appropriate project directory, or use the repository's workspace tooling when available. Do not assume that a command run at the workspace root applies to every project.

The workspace root also holds shared directories for generated documents. These directories organize work across the monorepo; they are not individual application or package directories. The **Generated documents** section defines the configured categories and storage rules, including the Cursor exception. In those rules, "repository root" means this workspace root, even when you are working inside a project subdirectory. Include the relevant project name in a document's filename or opening description so its scope is clear. Create document directories only when needed.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit `AGENTS.md` unless the user explicitly asks you to update it.

## Factory guidance maintenance

Before completing platform changes that alter applet-facing capabilities, constraints, defaults or authoring workflows, compare them with shared factory guidance. If the developer requested the corresponding guidance update, perform it within scope. Otherwise name the affected files and proposed changes, explain the mismatch and ask whether to update them. Continue independent authorized work; silence or approval of platform code alone is not factory-edit approval. Record declined or pending updates and compatibility effects in the platform changelog and handoff.

During applet creation/customization, also recognize clear instructions intended for all applets, even when the prompt does not name factory files. That shared intent authorizes the corresponding factory update. Classify it as a requirement, default or best practice using [factory rules](factory/guides/rules.md), update its canonical guidance and reconcile conflicts. Do not duplicate an existing coherent rule. Ask only when shared versus local scope is ambiguous. A reusable local fix alone is not shared authorization. Never document an unavailable capability as supported, retrofit unrelated applets without scope, or erase explicit local overrides.

Shared guidance includes factory AGENTS/README, `factory/applets/AGENTS.md`, guides, skills and policy templates/generated creator instructions. Applet code, README, specs, changelogs and authorized port reservations are local/operational work. Local overrides update local records. Restoring already-documented behavior or repacking unchanged guidance needs no factory-update question. In exported workspaces, identify the factory copy updated; no upstream write access is implied.

## Applet document exception

Applet-specific specs, plans, investigations and verification summaries live in `<applet>/.specs/`; their development records live in `<applet>/.changelog/`. Follow [applet records](factory/guides/applet-records.md), with flat files and no phase/date nesting, even in this monorepo. This exception overrides root generated-document, plan-writing, plan-implementation and changelog storage rules for applet work. Do not create other applet documentation dot folders. Platform, shared factory and tooling records retain root phase/date rules. Split mixed work by component and cross-link records. Preserve existing historical records at their original paths.

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

<!--
## Running code and managing packages

### Commands

- Do not start development servers, such as `uv run main.py`, `bun run dev`, or `pnpm dev`, unless the user explicitly asks. Assume the development server is already running.
- Do not run build commands unless the user explicitly asks.

### Package management

- Do not install packages yourself during routine tasks. You may install packages needed to complete an extended workflow that includes repeated execution and verification.
- For routine dependency changes, update the dependency manifest, such as `package.json` or `pyproject.toml`. Tell the user in your final response that they need to install the dependencies before running the program.
-->

## Testing and verification

- Do not create test files or modify existing tests unless the user explicitly asks for test coverage.
- You may run existing tests and perform other verification without adding or changing test files.
- After changing code, run the appropriate linting or verification command for the modified files before finalizing the work. If a required check cannot run, explain why and identify what remains unverified.

## Plans writing rules

Write plans so a lightweight coding agent can implement the intended result without access to the planning conversation or having to invent missing design decisions. Be detailed and specific about behavior and implementation, while avoiding repeated background and irrelevant detail.

- Read the relevant code, applicable project instructions, current architecture and phase-specific documents before planning. Verify paths and existing APIs instead of guessing them.
- State the project, phase, problem, intended outcome, scope, exclusions, constraints and observable acceptance criteria. Preserve the user's requirements and decisions, including later corrections.
- Explain the chosen approach and the reasons for material decisions. Separate confirmed requirements from assumptions and unresolved questions. Resolve implementation-blocking questions before treating a plan as ready to implement.
- Divide the work into ordered, dependency-aware steps by software component. Identify the files to create or change, the functions or interfaces involved, and the exact behavior each step must produce. Reference existing patterns to reuse.
- Specify relevant data shapes, contracts, control and data flow, state transitions, error handling and edge cases. Include concrete examples or pseudocode where prose would leave implementation choices ambiguous. Cover migrations, compatibility and rollout when applicable.
- Give each step its verification commands, working directory and expected results, plus any necessary manual checks. Follow the **Testing and verification** rules; do not prescribe new or modified tests unless the user requests test coverage.
- Make the handoff self-contained with links to supporting documents, prerequisites, dependencies and risks. Include the component commit boundaries required below and clear completion criteria. Avoid vague tasks such as "handle errors" or "update as needed" without specifying the required behavior.
- Save plans using the **Generated documents** rules and **Applet document exception**. When decisions change, update the affected plan details and record the reason in the development changelog so the implementation agent can identify the current intended behavior.

## Plan implementation rules

- Read the full plan, its referenced guidance and the applicable project instructions before editing. Check the plan against the current code, active phase and latest user decisions.
- Follow the plan's component order and dependencies, the coding philosophy above, and the repository's existing architecture and design patterns.
- If the plan conflicts with current requirements or code, establish the intended behavior before implementing the affected step. Record material deviations and their rationale in the plan and development changelog. Do not silently substitute a different design.
- Verify each step against its acceptance criteria and the **Testing and verification** rules before committing it. Keep the development changelog current and report completion, deviations and any remaining verification gaps.

## Version control

For every user-requested change, commit the resulting changes as part of the task unless the user explicitly asks you not to commit. This applies to direct change requests and plan implementation, including code, configuration, documentation and agent-instruction changes of any size. A separate request to commit or a written plan is not required.

1. Before editing, break substantial work into ordered logical steps with clear commit boundaries, organized by software component and dependencies. Work spanning multiple components or independently verifiable stages requires multiple steps and commits. Follow an existing plan when provided; otherwise, outline the steps in a brief progress update and proceed without requiring a separate planning task. A small, focused change may use one step and one commit.
2. Complete and verify each step using the applicable project checks and the **Testing and verification** rules, update its development changelog, and commit it in the affected repositories before starting the next step. Use separate commits for different components. Do not defer all commits until the end of substantial work. Include only changes related to that step; do not commit unrelated or pre-existing work or repositories.
3. Use the commit message format `feat/(_x): short message`. Replace `_x` with the relevant section, feature, or module name, such as `feat/(auth): add sign-in`.
4. Use the email returned by `git config user.email` in each affected repository as the commit author email. Do not substitute another email address.
5. Follow the coding philosophy above and the repository's existing architecture and design patterns.
6. In the final response, report the commits made and any verification gaps. If verification or committing is blocked, explain the blocker and identify any changes left uncommitted instead of claiming the task is fully complete.

## Thread titles

- Write a specific title describing the problem the conversation addresses. Use 3 to 5 words, excluding the status emoji.
- Start every title with one status emoji and update it as work progresses:
  - 🟡: Investigation has started, but no solution, file change, or completed document is available yet.
  - 🟣: A bug has been identified, or a plan, report, or review has been completed, and implementation has not started.
  - 🔴: An existing conversation has moved into implementing a fix.
  - 🔵: A fix has been implemented but still needs verification. Also use this status immediately when a new conversation starts with a request to implement a fix, skipping 🟡 and 🔴 for that initial title.
  - 🟢: The fix has been implemented and verified.
- Regenerate the title from the current task context after context compaction and whenever a new conversation fork is created.

## Archived documents

Ignore files whose names contain `.archive.` when reading `.plans`, `.docs`, `.research`, `.architecture`, `.notes`, `notes`, or other generated-document directories for current requirements or implementation guidance. These files are historical records. Read or modify them only when the user explicitly asks for historical investigation or changes to those archives. Current architectural guidance lives in `.architecture/`; current operating instructions live in `.docs/` under the active phase. Use the phase-context rules below when consulting older operating instructions.

## Generated documents

> When working inside Cursor, skip the document-storage rules in this section.

- Configured document categories: `[".plans", ".docs", ".reports", ".reviews", ".research", ".changelog"]`. This array is the single source of truth for document storage. Add or remove entries here to change which document types receive dedicated directories.
- Map implementation plans and proposed work to `.plans`, documentation and technical explanations to `.docs`, findings/assessments/verification reports to `.reports`, code/design/architecture reviews to `.reviews`, research briefs/investigations/technical comparisons to `.research`, and concise development change records to `.changelog`. Use the plural directory name `.reviews`. For example, a research brief or a written investigation of a technical topic belongs in `.research`.
- When the user explicitly asks you to create or write a document in a configured category, complete and save it during the same task. Do not leave it only in chat. Ordinary explanations, analyses, summaries, and status updates do not require saved documents unless the user explicitly requests a document.
- Maintain development change records as required by **Development changelog**, even without a separate request for a document.
- For platform/shared work, store each document under `<category>/<phase>/YYYY-MM-DD/` at the repository root. Use the category exactly as listed, including its leading dot. For example, use `.plans/phase-2/2026-10-27/` or `.research/phase-3/2026-10-28/`. Determine `<phase>` using the rules below.
- Name each document `HHMMSS-descriptive-document-name.md`. Use the user's local creation date and time for both the directory and the six-digit, 24-hour timestamp. Use a concise, kebab-case description that identifies the document type, such as `143025-browser-api-research.md`.
- Create category, phase and date directories as needed. Never overwrite an existing document when creating a new one. If a filename already exists, choose a distinct descriptive name.
- After saving a document, link to its location and briefly summarize it in your response. End the response with a fenced code block containing only the filename. If you saved multiple documents, put each filename on its own line in that final block. Do not include directory paths or other text in the block.

### Phase selection and context

- Read the current Git branch at the workspace root when creating a document or assigning a TODO to a phase. Match the entire branch name against `^proto/(phase-[0-9]+)$` and use the captured phase verbatim. For example, `proto/phase-2` maps to `phase-2` and `proto/phase-3` maps to `phase-3`.
- Use `phase-unknown` if the branch does not match, no branch is available, or HEAD is detached. Do not infer a phase from the date, existing folders or part of a different branch name.
- Use the same phase rule for every configured category, including `.changelog`. Re-evaluate it after a branch change. When editing an existing record, keep its original phase and creation path unless the user requests a move.
- Consult documents for the active phase first. Documents from other phases are background and do not automatically carry requirements or decisions into the current phase. If earlier guidance is still relevant, explicitly adopt it in the current plan or document and note any superseded decisions. If current-phase guidance is missing, say so rather than treating an earlier phase as current. Follow the latest user decisions and current architecture when resolving conflicts.
- Keep existing records in their phase when development moves to another phase. Migrate older records only when requested, preserving their filenames, dates, evidence files and working references.

## TODO writing rules

When adding or updating TODOs in `TODOS.md`, use at most three structural levels: problem domain, development phase and individual TODO. Reuse the matching domain and phase sections.

- Use an H1 heading for the problem domain, such as `# Android release`.
- Use an H2 heading for the phase, such as `## phase-3` or `## phase-unknown`, selected by **Phase selection and context**. Do not add H3 or deeper headings or nested task lists.
- Write each TODO as a checkbox followed by a short bold title containing its local date of addition, then a colon and a specific instruction: `- [ ] **YYYY-MM-DD Short title**: Instruction and completion condition.`
- Keep the original addition date and phase when updating or completing a TODO. Use `[x]` for completed work. Include necessary context or links in the same item without introducing another structural level.

```markdown
# Android release

## phase-3

- [ ] **2026-10-30 Verify release signing**: Configure the operator-owned signing key and confirm the release APK signature on a physical device.
```

## Development changelog

Maintain a concise technical record for every logical development change, including code, configuration and agent-instruction changes. Update it during the work and finalize it with the verification outcome before completing the task. This is required even when the user does not explicitly request a changelog.

- For platform/shared work, create one Markdown file per logical change under `.changelog/<phase>/YYYY-MM-DD/HHMMSS-<project>-<change>.md`, using the shared phase, local creation time and collision rules. Update that same record as the change evolves instead of creating a file for every prompt or edit.
- State the goal and the changes made, including the affected components or files. Record material decisions from the user's prompts, the agent's answers and later inputs, plus decisions the agent made on the user's behalf. Identify who made each decision and give its brief rationale. Include changed or rejected approaches when they explain the final result.
- Summarize decisions rather than copying the conversation. Omit routine command output, repeated context and edit-by-edit narration. Aim for 100 to 200 words per change; use links to plans, code or reports for detail, and exceed this only when needed to preserve material decisions.
- Finish with what was verified, the outcome and any remaining limitation. Distinguish intended behavior from completed and verified work.
- Use a short title and four compact bullets: goal, changes, decisions and verification. Changelog records are historical context; current requirements remain in the active plan, architecture and operating documentation.

## Skills

Project skills live in `.skills/`. This directory can contain third-party skills and skills written for this project. Each skill is defined by a `SKILL.md` file, usually at `.skills/<skill-name>/SKILL.md`.

Read a skill's `SKILL.md` before applying it. Resolve any relative file references from that skill's directory.

### Apple design for custom apps

When designing, building, or changing a custom app, always use the relevant Apple design skills in `.skills/` to guide design choices and app development. Read the applicable skill instructions and use their guidance for the app's platform and framework.

Do not use skills installed outside the project's `.skills/` directory unless the user explicitly requests them. The `unslop` instruction below is an explicit exception.

Use the `unslop` skill whenever you write an explanation in your response. Prefer a project copy if one is available; otherwise, use an installed copy.
