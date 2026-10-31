# Genesis automatic step commits

- Goal: Make automatic commits apply to direct change requests as well as plan implementation, so substantial work produces a verified commit at each logical step.
- Changes: Promoted the root `AGENTS.md` version-control rules to a standalone section. The rules now cover code, configuration, documentation and agent-instruction changes of any size, require ordered steps for substantial work, and allow a small focused change to use one commit. Each step includes verification and a changelog update before committing and starting the next step.
- Decisions: The user requested the broader scope because direct requests were leaving changes uncommitted. The agent retained the existing commit-message format and repository author-email rule, made clear that no separate plan or commit request is needed, and required final reporting of commits and blockers. Unrelated and pre-existing work stays outside these commits.
- Verification: Reviewed the revised section against direct requests, plan implementation, small changes and substantial work. `git diff --check` passed. Only Markdown instructions and this record changed; no runtime checks were needed.
