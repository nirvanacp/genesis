# Genesis current system architecture

This diagram describes the code selected in the repository on 30 October 2026. Solid arrows show runtime interactions or data flow; dotted arrows show build, provisioning, or development-only paths. The Hacker News (HN) applet is the only applet selected for the APK in `genesis.packages.json`. X and YouTube are inactive prototypes.

```mermaid
flowchart TB
    user["User"]

    subgraph creator["Creator and platform tooling"]
        appletSrc["Applet source and manifest<br/>factory/applets/news.ycombinator.com"]
        sdkSrc["Genesis SDK<br/>packages/sdk"]
        cli["Applet CLI and packager<br/>packages/applet-tools"]
        build["Package selection and APK build<br/>genesis.packages.json and tools"]
        provision["Development service provisioning<br/>CLI / tools/services.mjs"]
        appletSrc --> cli
        sdkSrc --> cli
        cli --> build
    end

    subgraph phone["Android device: Genesis host"]
        assets["Bundled APK package assets"]
        store["PackageStore<br/>bundled assets; debug revisions and rollback"]
        shell["MainActivity and HostViews<br/>launcher, native navigation and recovery"]
        browser["BrowserAdapter<br/>WebViews, navigation and message channels"]
        loader["PackageAssets / WebViewAssetLoader<br/>verified local applet pages"]
        bridge["NativeBridge<br/>JNI transport"]
        rust["Rust host controller<br/>lifecycle, identity, policy and capabilities"]
        contracts["Shared host contracts<br/>crates/contracts"]
        localWorker["Rust storage worker<br/>revision-checked document operations"]
        localDB[("Private host SQLite<br/>applet-scoped documents")]
        serviceClient["ServiceClient<br/>bounded HTTPS requests"]
        credentials["Private service settings<br/>Keystore-encrypted token"]

        subgraph webview["Customized WebView document"]
            siteDOM["Website DOM and session"]
            sdk["Bundled SDK runtime<br/>managed effects, navigation, storage and services"]
            hn["HN applet frontend<br/>source adapters, React UI and local pages"]
            hn -->|"public SDK API"| sdk
            hn -->|"read and modify"| siteDOM
        end

        reader["External reader WebView<br/>ordinary browsing, no applet bridge"]
        assets --> store
        store -->|"effective package index and assets"| shell
        shell --> browser
        browser --> loader
        loader -->|"packaged pages and assets"| webview
        browser <-->|"document-bound messages"| sdk
        shell <-->|"events and commands"| bridge
        bridge <-->|"JNI"| rust
        contracts --- rust
        rust -->|"storage jobs"| localWorker
        localWorker <--> localDB
        localWorker -->|"completion via JNI"| bridge
        rust -->|"service commands via JNI"| bridge
        shell --> serviceClient
        serviceClient --> credentials
        browser -->|"external links"| reader
    end

    subgraph remote["External systems"]
        website["Hacker News website<br/>upstream application and account"]
        publisher["External publisher websites"]
        backend["HN applet backend<br/>Node HTTP/HTTPS API"]
        backendDB[("Backend SQLite<br/>bookmarks and categories")]
        backend <--> backendDB
    end

    user --> shell
    user --> siteDOM
    siteDOM <-->|"website requests and cookies"| website
    reader <-->|"ordinary web requests"| publisher
    serviceClient <-->|"HTTPS and bearer token"| backend
    build -.->|"frontend assets in APK"| assets
    cli -.->|"authorized adb; debug only"| store
    provision -.->|"debug connection and optional certificate"| credentials
    provision -.->|"local development service and adb reverse"| backend
```

The SDK and Android exchange messages through a document-bound channel. Android passes host events through JNI to the Rust controller, which returns commands for Android to execute. The host validates identities and declared capabilities; it does not implement HN-specific backend operations. Completion messages return through the host and are checked against the live document before delivery.

The HN frontend uses the optional host document store for Post drafts and public account coordination. Its bookmarks and categories are authoritative in the separate HN backend database. Website cookies remain part of the WebView session; the backend uses a separate service credential. The backend is not bundled into or executed by the Android app.

Debug builds can import validated applet revisions and service settings over authorized adb. Release builds use bundled packages and do not consume those development imports. The preserved `crates/page-runtime` Wasm code and Kotlin starter are inactive; production publisher trust and independent distribution are not implemented.

Sources: [architecture index](../../../.architecture/README.md), [platform](../../../.architecture/platform.md), [browser runtime](../../../.architecture/browser-runtime.md), [services and data](../../../.architecture/services-and-data.md), [HN applet](../../../.architecture/hacker-news.md), and [package selection](../../../genesis.packages.json). No current phase-4 operating guide is present in `.docs`.
