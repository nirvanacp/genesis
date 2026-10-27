# AGENTS.md

## Monorepo layout and working scope

This codebase is a monorepo. The directory containing this `AGENTS.md` is the workspace root, with separate projects or codebases maintained in subdirectories beneath it. A task may concern one project, several related projects, or shared files at the root.

- Before making changes, identify which project directories the task concerns. Do not assume that the current working directory is the target project's root.
- Read any applicable `AGENTS.md` files within the target project. Follow its existing structure, dependencies, tooling, and conventions. Projects may use different languages, frameworks, and verification commands.
- Keep changes within the requested scope. Change shared files or sibling projects only when the task requires it, and account for any projects affected by a shared change.
- Run project-specific commands from the appropriate project directory, or use the repository's workspace tooling when available. Do not assume that a command run at the workspace root applies to every project.

The workspace root also holds shared directories for generated documents. These directories organize work across the monorepo; they are not individual application or package directories:

- `.plans` holds implementation plans and proposed work.
- `.docs` holds generated documentation and technical explanations.
- `.reports` holds findings, assessments, and verification reports.
- `.reviews` holds code, design, and architecture reviews. Use the plural directory name `.reviews`.
- `.research` holds research briefs, investigations, and technical comparisons.

The **Generated documents** section below defines the configured categories and the rules for saving these files, including the Cursor exception. In those rules, "repository root" means this workspace root, even when you are working inside a project subdirectory. Include the relevant project name in a document's filename or opening description so its scope is clear. Create document directories only when needed.

Only instructions outside HTML comments are active. Treat all text inside HTML comments as inactive configuration.

Do not edit `AGENTS.md` unless the user explicitly asks you to update it.

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

## Version control

<!--
- Never create a Git commit unless the user explicitly asks you to commit the changes.
-->

When the user asks you to implement a plan **and** commit the changes:

1. Break the plan into logical steps when needed, and implement them in order.
2. After completing and verifying each step, commit its changes in the affected repositories. Include only changes related to that step; do not commit unrelated work or repositories.
3. Use the commit message format `feat/(_x): short message`. Replace `_x` with the relevant section, feature, or module name, such as `feat/(auth): add sign-in`.
4. Use the email returned by `git config user.email` in each affected repository as the commit author email. Do not substitute another email address.
5. Follow the coding philosophy above and the repository's existing architecture and design patterns.

## Thread titles

- Write a specific title describing the problem the conversation addresses. Use 3 to 5 words, excluding the status emoji.
- Start every title with one status emoji and update it as work progresses:
  - 🟡: Investigation has started, but no solution, file change, or completed document is available yet.
  - 🟣: A bug has been identified, or a plan, report, or review has been completed, and implementation has not started.
  - 🔴: An existing conversation has moved into implementing a fix.
  - 🔵: A fix has been implemented but still needs verification. Also use this status immediately when a new conversation starts with a request to implement a fix, skipping 🟡 and 🔴 for that initial title.
  - 🟢: The fix has been implemented and verified.
- Regenerate the title from the current task context after context compaction and whenever a new conversation fork is created.

## Generated documents

> When working inside Cursor, skip the document-storage rules in this section.

- Configured document categories: `[".plans", ".docs", ".reports", ".reviews", ".research"]`. This array is the single source of truth for document storage. Add or remove entries here to change which document types receive dedicated directories.
- Map plans to `.plans`, documentation to `.docs`, reports to `.reports`, reviews to `.reviews`, and research documents to `.research`. For example, a research brief or a written investigation of a technical topic belongs in `.research`.
- When the user explicitly asks you to create or write a document in a configured category, complete and save it during the same task. Do not leave it only in chat. Ordinary explanations, analyses, summaries, and status updates do not require saved documents unless the user explicitly requests a document.
- Store each document under `<category>/YYYY-MM-DD/` at the repository root. Use the category exactly as listed, including its leading dot. For example, use `.plans/2026-10-27/` or `.research/2026-10-27/`.
- Name each document `HHMMSS-descriptive-document-name.md`. Use the user's local creation date and time for both the directory and the six-digit, 24-hour timestamp. Use a concise, kebab-case description that identifies the document type, such as `143025-browser-api-research.md`.
- Create category and date directories as needed. Never overwrite an existing document when creating a new one. If a filename already exists, choose a distinct descriptive name.
- After saving a document, link to its location and briefly summarize it in your response. End the response with a fenced code block containing only the filename. If you saved multiple documents, put each filename on its own line in that final block. Do not include directory paths or other text in the block.

## Skills

Project skills live in `.skills/`. This directory can contain third-party skills and skills written for this project. Each skill is defined by a `SKILL.md` file, usually at `.skills/<skill-name>/SKILL.md`.

Read a skill's `SKILL.md` before applying it. Resolve any relative file references from that skill's directory.

Do not use skills installed outside the project's `.skills/` directory unless the user explicitly requests them. The `unslop` instruction below is an explicit exception.

Use the `unslop` skill whenever you write an explanation in your response. Prefer a project copy if one is available; otherwise, use an installed copy.
