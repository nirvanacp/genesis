# Get ready

[Learning path](../README.md) · Step 3

If someone has already installed your app, you can open it and use it. This setup is for creating or changing apps yourself.

## On your phone

You need an Android device or emulator with a compatible Genesis debug APK. An APK is the Android installation file.

Ask a Genesis maintainer for that build and its installation instructions. A release build does not load applets through the development commands in this guide.

For computer-to-phone installation, enable Android developer options and USB debugging. Connect the device and accept its debugging authorization prompt for a computer you trust.

## On your computer

You need:

- A coding agent that can edit files and run local commands.
- Node.js `24.15.0` and npm `11.14.1`, the current supported versions.
- Android Platform Tools, including `adb`, to connect to your device.
- `genesis-sdk-0.3.0.tgz` and `genesis-applet-tools-0.3.0.tgz` from a Genesis maintainer.

The `.tgz` files are package archives. They are not currently available through a public npm package install.

You do not need Android Studio, a Rust compiler, or Genesis's platform source for ordinary applet work. An emulator setup may need additional Android tooling.

## Check the connection

Ask your agent to run:

```sh
node --version
npm --version
adb devices
```

The first two commands should show the versions above. Your Android device should appear with status `device`, rather than `unauthorized` or `offline`.

Keep its serial, such as `emulator-5554`, for later commands. Always select the intended device if more than one is connected.

## Give the agent its instructions

The creator tool copies matching guidance into each new app's `factory/` folder. Ask the agent to read `factory/AGENTS.md` before changing the app.

There is no required built-in agent connection in Genesis today. You use your coding tool on the computer, then install its output on the phone.

**Ready when:** the host and package versions match, the archives are available, and adb sees your authorized device.

**Next:** [Make your first app](first-app.md).
