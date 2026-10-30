---
name: genesis-verify-applet
description: Verify or diagnose a Genesis applet with package checks, TypeScript, source identity and cleanup checks, device navigation, and service/data failure checks. Use before handing off an applet or when it fails; distinguish applet defects from missing platform capabilities.
---

# Verify a Genesis applet

Read [factory instructions](../../AGENTS.md) and [verification](../../guides/verification.md). Use [SDK reference](../../guides/sdk-reference.md) to confirm expected behavior.

1. Identify the exact applet revision, selected build, SDK version, and device/provider when available. Establish a reproducible symptom or acceptance flow. Use the standalone checker for this applet; the Genesis root checker covers only the APK selection, HN by default.
2. Run existing static checks appropriate to the change. Inspect their output and separate pre-existing failures. Do not add test files or install unrelated tooling as a substitute for the existing workflow.
3. Verify source extraction, duplicate mounts, content-key changes, cleanup, route changes, and stale async results. Check source, local page, reader, Back, and return-to-section behavior as relevant.
4. For stateful features, distinguish no records from failed reads. Check conflicts and uncertain writes with disposable applet data only. Never retry an ambiguous write blindly, change the authoritative store silently, or expose credentials in evidence.
5. Check the native-feeling requirements: usable navigation during failures, correct shell selection, initial UI before network data, touch targets, text scaling, TalkBack labels, and no duplicate source/app navigation. Record unperformed checks honestly.
6. Classify each failure as applet logic, source-site change, environment/backend, or platform contract. Give a minimal reproduction and file ownership. Fix within the user's authorized scope; a verification-only request produces findings without edits.

The handoff states expected and actual behavior, changed files if any, commands/results, device evidence, and remaining blockers. A passing typecheck is not a live-site pass. Read-only verification does not authorize publishing content, modifying accounts, or deploying a backend.
