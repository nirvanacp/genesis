# HN skeleton loading

- Goal: make transitional and read-pending HN screens use gray content placeholders instead of visible loading prose.
- Changes: feed/discussion/profile/account skeletons, saved-story/category loading rows, bookmark-dialog form skeletons and compact write indicators share one applet component. Existing rows remain visible during refresh/pagination, with appending placeholders below them. Profile placeholders follow HN text fields rather than social-profile imagery. Dark verification exposed outer SDK backing colors overriding HN host colors; explicit applet host color priority preserves the intended light/dark palette. Category-read errors remain explicit.
- Decisions: use static neutral grays in both themes, retain cancellation and disabled controls, and expose pending work through hidden accessible status text. No data operations or source classification changed.
- Verification: standalone HN check/build passed. Integrated installed navigation and dialog verification follows both applet installs. A final markup review attached the pending indicator to the manager's actual details root. No repository tests were added or modified.
