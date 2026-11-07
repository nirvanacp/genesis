# Example applets

This folder is the Genesis example collection, laid out like an applet repository with several applets. Follow [factory instructions](../factory/AGENTS.md) and the root `AGENTS.md`.

- Each subdirectory that contains `applet.json` is one applet. Read its `.specs/current.md` and `README.md` before changing it.
- Applet records are flat: specs, plans and reviews in `<applet>/.specs/`, development records in `<applet>/.changelog/`, as described in [applet records](../factory/guides/applet-records.md). No phase or date folders.
- Backend ports are reserved in `ports.json`. `start-applet-servers.sh` and `scripts/` serve the whole collection; they are operator commands that coding agents do not run unless asked.
- Preserve each applet's id, service ids, stored data and backend.
