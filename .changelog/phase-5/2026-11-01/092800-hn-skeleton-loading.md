# HN skeleton loading

- Goal: make transitional and read-pending HN screens use gray content placeholders instead of visible loading prose.
- Changes: feed/discussion/profile/account skeletons, saved-story/category loading rows, bookmark-dialog form skeletons and compact write indicators share one applet component. Existing rows remain visible during refresh/pagination. Category-read errors remain explicit.
- Decisions: use static neutral grays in both themes, retain cancellation and disabled controls, and expose pending work through hidden accessible status text. No data operations or source classification changed.
- Verification: standalone HN check/build passed. Integrated installed navigation and dialog verification follows both applet installs. No repository tests were added or modified.
