# Hacker News compact navigation cues

- **Goal:** Remove repeated Website text that can crowd Hacker News story, comment, action and Saved links while preserving a visible destination cue.
- **Changes:** `HnLink` now shows a compact external arrow only for host-resolved website destinations and adds "opens website" to the accessible name. Shared theme styles keep the cue small without changing route decisions. The Hacker News README describes the behavior and current verification limits.
- **Decisions:** The user requested the same repair in X and Hacker News. I applied it to Hacker News's shared link renderer so feed, discussion, profile and Saved links follow one rule. Original website actions still use explicit labels such as "Visit website" and "Reply on website".
- **Verification:** TypeScript, applet check, build and `git diff --check` passed. Revision `05bbb73f21af86686f5d7304158e6972ea1d67dbcf4cd7d582e3bc8c95fbc58d` installed on the API-4 emulator. The feed, a real discussion, a Saved story and the signed-out Me screen rendered without the repeated Website word. Authenticated profile, large-text and TalkBack layouts remain uninspected on this revision.
