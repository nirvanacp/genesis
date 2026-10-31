# X active controls and editor lifecycle

- Goal: restore readable source controls and allow fresh folder intents after timeout or editor dismissal.
- Changes: source CSS corrects only X's qualified inline opacity .3 on active compose/toast owners, preserving zero-opacity exit state. Expired armed/switching intents release their slot. Ordinary navigation cancels intents while preserving bounded capability evidence. Category sheets report dismissal once through managed cleanup and identify Applet categories.
- Decisions: preserve source backgrounds and disabled/hidden states; keep capability separate from modal lifetime. Native Back, replacement and account invalidation share the same managed cleanup callback.
- Verification: applet TypeScript passed. Existing runtime cleanup remains responsible for focus and Back. Integrated device opacity/expiry checks follow installation. No source-wide opacity override or new test files.
