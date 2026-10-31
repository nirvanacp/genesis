# Owned foreground focus

- Goal: Keep the foreground, rather than its hidden website source, as the native input target throughout an applet visit and provider return.
- Changes: AppletPresentation explicitly makes the owned WebView focusable in touch mode and requests focus when revealing it. Hidden-source focus and accessibility suppression remain enforced independently.
- Decisions: The agent kept focus ownership in the framework so every applet benefits. Emulator investigation also established that a category input below a clipped dialog viewport requires scrolling before tapping; native focus alone cannot make an obscured field interactive.
- Verification: Android debug assembly and lint passed for the separate QA host. On the emulator, a fully visible owned category field accepted text, displayed the keyboard, and dismissed it with Back. HN category creation, membership assignment and filtering then completed. Broader provider and applet qualification continues in the migration.
