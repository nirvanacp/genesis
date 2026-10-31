# Make your first app

[Learning path](../README.md) · Step 4

Build a small Hacker News reader with larger text and more space. Keep its normal links and website behavior.

You need the files and device from [Get ready](get-ready.md). Let your coding agent handle the commands below.

## 1. Create the project

In a new, empty tools folder on your computer, install the tools archive. Replace `/absolute/path/` with the real locations.

```sh
npm install /absolute/path/genesis-applet-tools-0.3.0.tgz
npx --no-install genesis-applet create /absolute/path/my-reader --id my-reader --name "My reader" --source https://news.ycombinator.com/
```

Open the new `my-reader` folder in your coding tool. From that folder, install the supplied packages:

```sh
npm install /absolute/path/genesis-sdk-0.3.0.tgz /absolute/path/genesis-applet-tools-0.3.0.tgz
```

The starter creates files and instructions. It has not yet built your website-specific app or installed anything on Android.

## 2. Give the agent this request

> Read factory/AGENTS.md and the matching creator guides. Build My reader over Hacker News. Make story text larger and add comfortable spacing. Keep story links, comments, sign-in, and voting behavior. Inspect the real website before choosing what to change. Use no backend for this first version. Keep applet ID my-reader. Explain which routes you adapted and which remain ordinary website pages. Run the applet checks and build it. Do not submit votes or other account actions to verify it.

Your agent should change the applet files, not Genesis's platform code. If it cannot inspect the website, it should report that limitation instead of claiming the layout is verified.

## 3. Check and install

From `my-reader`, ask the agent to run:

```sh
npm run check
npm run build
npx --no-install genesis-applet dev status --device emulator-5554 --json
npx --no-install genesis-applet dev install dist --device emulator-5554 --json
```

Replace `emulator-5554` with your device serial. The host must support runtime API 2.

Save any unsaved work in Genesis first. Installation restarts it. If installation times out, inspect `dev status` before retrying; the app may already be installed.

## 4. Try it on the phone

1. Open Genesis and choose **My reader** from **Apps**.
2. Check that story text and spacing changed on the supported list page.
3. Open a story's comments, then use Back.
4. Open an external story link. Use **Close reader** to return.
5. Check that the original story and return path still make sense.

A passing build proves the package can be built. These phone checks establish whether the actual website works with your changes.

If it fails, give the agent the exact page, steps, and visible result. Keep using the original website where needed.

## Keep what you made

Ask your agent to save the source and dependency lockfile in version control. Keep the applet ID unchanged when improving this app.

**Done when:** your app appears in Apps, the intended layout changes work, and browsing returns correctly.

**Next:** [Use your app](../use/everyday-use.md), or [describe your next change](../create/describe-your-app.md).
