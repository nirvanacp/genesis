# HN interaction routing

- Goal: Prevent local comment scrolling from swallowing a different document or explicit website action.
- Changes: HnLink compares the accepted current source origin/path/query before local anchor scrolling and excludes explicit website actions. Explicit website resolution no longer rewrites the target to a comment permalink. Renamed the combined Vote/comment link to describe opening the discussion website.
- Decisions: Preserve existing local Save/category/collapse actions and provider-owned HN forms. No new upstream voting or favorites implementation.
- Verification: HN TypeScript, applet check/build and whitespace checks passed. Live device fragment/form return qualification remains pending.
