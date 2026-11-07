# Applet defaults

Apply these automatically to new apps. When customizing, keep existing explicit choices and change only what was requested. A brief compatible alternative from the user overrides a default; the [requirements](rules.md) still apply. Record choices and overrides in the [current spec](applet-records.md).

| ID | Default behavior | Acceptance and boundary |
| --- | --- | --- |
| default-platform-menu | The shell draws a floating menu button in the top-right corner with the Genesis menu (Home, Reload applet, Open website, Service connections, Applet info) | Never draw these controls in the foreground, and keep the corner clear. Set `shell.accent` to the product's brand color. The menu cannot be hidden from an applet. |
| default-mobile-identity | Follow the source product's mobile app conventions; inspect its mobile website where the app is unavailable | Connected screens and new features share one set of tokens and density. Do not copy another product's features. |
| default-primary-navigation | One bottom tab bar inside the foreground for the product's main sections; content tabs and filters inside each screen | Selecting a tab opens its root with `mode: "root"`; reselecting it scrolls to the top or resets its stack. Detail Back and website sheet close restore the opener. |
| default-pending-skeletons | Neutral, static, destination-shaped placeholders in light and dark | Keep useful content and drafts during refresh. Errors, sign-in prompts, empty results and uncertain outcomes stay readable. See [design](design.md#skeletons). |
| default-website-cue | A compact external-arrow icon with the accessible name "opens website" on controls that open the website sheet | The cue is visible before activation. Explicit actions such as "Sign in on website" keep their wording. |
| default-refresh | Pull to refresh where the product has it, plus a labeled Refresh control | Keep the current query and filter. Exclude inputs, nested scrollers, horizontal tabs, media and dialogs. Wait for the real result and allow failure. |
| default-transient-dismissal | Back closes the open menu, sheet or dialog before leaving the screen; Close and Cancel restore focus | Implement dialogs as screens or with a leave guard so Android Back reaches them. |
| default-theme-and-layout | Explicit canvas and text colors from tokens, compact readable density, opaque panels | Both themes, long text and narrow widths stay readable. Inline links need not become tall rows; standalone controls stay at 48 dp. |
| default-keyboard-safe-sheets | Scrollable body, with Close, Cancel and confirmation always reachable | With the keyboard open or a short viewport, drafts and warnings survive and footers do not clip. |

A skeleton can become a spinner if the user asks; the accessible status and honest states stay. The website cue's look can change; the rule that the website opens only on explicit intent cannot. Theme and density choices must keep navigation accessible.

These defaults are lessons from news and social clients. Exact tab counts, font sizes, brand colors, account restrictions and site-specific extraction are applet choices. A kit update does not authorize redesigning existing apps.
