# Start an isolated applet

Read [explicit navigation](navigation.md) for schema-3/API-4 URL coverage, website actions, SDK controls and Return behavior. SDK/tools 0.5.0 use the host policy for new applets. Schema-2/API-3 examples below remain legacy compatibility reference wherever they use direct `webViews.open`; migrate those calls through resolve/activate or the navigation controls before using API 4.

Read [factory instructions](../AGENTS.md), [product scope](product-scope.md) and [the isolated architecture](isolated-applets.md). New applets use one stable identity, an explicit URL contract, hidden source adapters and an owned foreground. React and backend services are optional.

Use Node `24.15.0`, npm `11.14.1`, matching SDK `0.5.0` / tools `0.5.0` archives and a compatible API-4 debug host from the platform maintainer. Archives are not published to the public registry. Ordinary applet creation/build/install needs Node, the supplied artifacts and authorized adb, not Rust/Android compilers or Genesis source.

```sh
npm install /absolute/path/genesis-applet-tools-0.5.0.tgz
npx --no-install genesis-applet create /absolute/path/my-reader --id my-reader --name "My reader" --source https://example.com/ --react
```

In the generated applet directory, install the matching archives and generated dependencies, then check/build:

```sh
npm install /absolute/path/genesis-sdk-0.5.0.tgz /absolute/path/genesis-applet-tools-0.5.0.tgz
npm run check
npm run build
```

`create` writes the manifest, adapter, foreground, TypeScript configuration, README, operator-owned `start.sh` and matching portable `factory/` kit. It installs no dependencies, starts no services and connects no device. The starter handles unsupported content safely; it is not a completed website client. Inspect real authorized DOM, build a route inventory and replace its adapter/foreground together. Preserve every required product journey in the brief and acceptance table.

The source entry default-exports `defineSourceAdapter`. The owned page default-exports `defineForeground`; it renders immediately and subscribes to accepted source models. Never import native/internal RPC or call bootstrap. Do not turn source CSS into the applet foreground. See [SDK reference](sdk-reference.md) and [patterns](patterns.md).

After a successful build, use an explicit authorized device serial:

```sh
npx --no-install genesis-applet dev status --device emulator-5554 --json
npx --no-install genesis-applet dev install dist --device emulator-5554 --json
```

For updates add `--replace`. Permission-origin/capability/service changes also require the tool's explicit permission-change flag after reviewing its diff. Keep the same applet ID and record keys. Rollback selects previous compatible code, not previous data. Package acceptance is separate from source/UI/service readiness. If installation times out, inspect status before retrying.

Use `--application <host-id>` for a separate QA host and `--adb <path>` when necessary. Release hosts ignore developer imports. Do not clear app data to repair a package or delete evidence packages that contain user records. Prefer disposable QA applets in a separate installation. Run the complete [verification workflow](verification.md) before delivery.

Every applet keeps `start.sh` current for its backend dependencies and reserves ports under the [services guide](services-and-data.md). Source sessions, accounts, forms and protected media use explicit website views with return navigation. A backend remains separately operated and is never bundled into the phone as a Node process.
