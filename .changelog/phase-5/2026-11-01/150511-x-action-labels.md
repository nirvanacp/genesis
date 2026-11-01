# X action labels

- Goal: Make Follow and unavailable controls communicate their actual behavior.
- Changes: Follow now displays its text label instead of an overflow icon. Disabled mutation controls include their unavailable state in the accessible name.
- Decisions: Preserve semantic buttons and source-derived state; do not substitute website navigation when a live action is unavailable.
- Verification: X TypeScript, applet check/build and in-place installation passed. Final X revision is a6bc4cfb458af2da19aef0457fbe3e16ee3dbb1aa5537f2c7292f800d8d38b64. No social mutation submitted. Broader accessibility and account-state variants remain unqualified.
