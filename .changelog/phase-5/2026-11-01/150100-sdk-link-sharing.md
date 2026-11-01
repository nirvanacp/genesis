# Optional native link sharing

- Goal: Expose the native chooser through a public foreground capability.
- Changes: SDK 0.5.1 adds feature-detected sharing.supported and sharing.shareUrl. Updated workspace SDK dependency pins and lockfile, including inactive YouTube only to preserve workspace resolution.
- Decisions: Keep runtime API 4 and manifest schema 3. Older hosts reject the optional call locally and retain Copy link. SourceAdapterContext does not expose sharing.
- Verification: SDK build, complete workspace TypeScript and selected-package checks passed. Device chooser qualification remains pending.
