# X skeleton loading

- Goal: replace visible loading prose with neutral content-shaped placeholders throughout X's owned interface.
- Changes: added reusable feed/profile/people/media/form skeletons and compact pending-action placeholders. Source transitions, account verification, Categories reads, category editor/manager, pagination and refresh feedback use the same presentation. Image areas have neutral backing while images arrive. Existing content remains available during refresh and errors remain actionable.
- Decisions: static gray blocks avoid unnecessary motion and support reduced motion automatically. Decorative shapes are hidden from accessibility; a hidden status describes pending work. Existing navigation, async completion, account gates and writes are unchanged.
- Verification: standalone X TypeScript/package check and build passed. Real device transition/dialog and dark/large-text checks follow after both applets are installed. No repository tests were added.
