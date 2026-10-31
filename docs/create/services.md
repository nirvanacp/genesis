# Add a backend only when needed

[Learning path](../README.md) · Advanced, optional

A backend is a separate server that stores data or applies your app's rules. It does not run inside Genesis on your phone.

Use one when your app needs a server-managed library or another service. A layout change needs no backend. Small on-device features may need only local storage.

## Before building it

Tell your agent:

- Whether the app is for you alone or several users.
- Which data goes to the server.
- Where it should run and who will maintain it.
- What should happen when it is unreachable.
- How records will be backed up and restored.

Cross-device access and multi-user accounts need their own design. Adding a backend does not supply either automatically.

## Request the whole setup

> Read factory/AGENTS.md and its services guide. Add a backend for my personal saved library. Keep website bookmarks separate. Explain where records and credentials live. Maintain start.sh for all required services. Document startup, reconnection, backup, and recovery. Do not run services until I explicitly ask you to start them.

The agent should use declared Genesis service connections and keep credentials outside source files and frontend code.

## Local development

Once the applet is installed and its backend is implemented, the operator can run this from the applet folder:

```sh
./start.sh --device emulator-5554
```

Use your real device serial. A correctly maintained script starts the required local services and restores the device connection. Check your app README for additional setup.

For the standard Node service helper, local development also needs OpenSSL and authorized adb. The server stays on your computer. The computer must be running and reachable through the development connection.

Startup or provisioning can restart Genesis. Save unsaved work first. After a computer or phone restart, rerun the documented device startup command to restore connectivity.

To stop managed local services while keeping their data:

```sh
./start.sh --stop
```

## Moving beyond your computer

Everyday remote use needs a reachable HTTPS server, durable storage, backups, and appropriate account authorization. The local development tunnel is not production hosting.

For implementation details, your agent should use the [creator services guide](../../factory/guides/services-and-data.md).

**Next:** [Update your app safely](../maintain/update-your-app.md).
