# HN touch targets

- Goal: Preserve HN while correcting measured 44px controls against the selected 48px Android target.
- Changes: Enlarged story Save and vote targets to 48px and adjusted title reservation and detail-grid columns accordingly. Renamed the launcher label to Hacker News without changing hn-bookmarks identity or data.
- Decisions: Keep the warm palette, source forms, comment hierarchy, categories and existing Search placeholder. No backend or search expansion.
- Verification: HN CLI check/build passed and the updated revision was accepted in place on the emulator. The launcher visibly contains Hacker News and X. Source reading layout verification follows separately; no permanent tests were added.
