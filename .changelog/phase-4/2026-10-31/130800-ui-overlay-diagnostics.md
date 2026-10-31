# Shared overlay diagnostics

- Goal: diagnose source and owned-overlay transparency without applying unsafe global style changes.
- Changes: added bounded read-only CDP sampling of composed ancestry, computed styles and approximate opacity products. Updated portable authoring and verification guidance for panels, backdrops, disabled state and renderer diagnosis.
- Decisions: the user requested implementation of the repair plans. Keep website selectors out of shared tooling; select an exact debug target and explicit selectors, exclude page text, and never mutate inspected DOM.
- Verification: Node syntax and whitespace checks passed. Live source sampling is part of the integrated X qualification; a style report alone does not establish painted correctness.
