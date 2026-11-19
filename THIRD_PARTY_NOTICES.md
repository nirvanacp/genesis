# Third-party notices

The Genesis Android app (APK) includes the third-party software listed below. Each component is distributed under its own licence, named here by its SPDX identifier and linked to its source. This file lists what the release APK contains as of Genesis 0.1.0. It does not cover the licence of Genesis itself.

## GeckoView (Mozilla)

- Component: `org.mozilla.geckoview:geckoview` 160.0.20261104181552, the optional website engine (`libxul.so`, `liblgpllibs.so` and the GeckoView Java classes).
- Licence: [MPL-2.0](https://www.mozilla.org/MPL/2.0/). GeckoView also contains third-party code under other licences, among them LGPL-2.1 code in `liblgpllibs.so`. The complete list ships inside the engine and can be shown at `about:license` in a GeckoView page.
- Source: the Firefox 160.0 source, at <https://archive.mozilla.org/pub/firefox/releases/160.0/source/> and <https://github.com/mozilla-firefox/firefox>. Binaries come from <https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/>. Genesis does not modify GeckoView.
- GeckoView depends on the Google Play services client libraries listed under **Java and Kotlin libraries**, which are not open source.

## Rust crates

The native host (`libgenesis_host.so`) is built from these crates for `aarch64-linux-android` and `x86_64-linux-android`. `libsqlite3-sys` compiles the bundled SQLite source, which is in the public domain (<https://sqlite.org/copyright.html>).

| Crate | Version | Licence | Source |
| --- | --- | --- | --- |
| base64 | 0.22.1 | MIT OR Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| bitflags | 2.13.2 | MIT OR Apache-2.0 | https://github.com/bitflags/bitflags |
| bytes | 1.12.1 | MIT | https://github.com/tokio-rs/bytes |
| cfg-if | 1.0.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/cfg-if |
| combine | 4.6.9 | MIT | https://github.com/Marwes/combine |
| displaydoc | 0.2.7 | MIT OR Apache-2.0 | https://github.com/yaahc/displaydoc |
| equivalent | 1.0.3 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/equivalent |
| fallible-iterator | 0.3.0 | MIT/Apache-2.0 | https://github.com/sfackler/rust-fallible-iterator |
| fallible-streaming-iterator | 0.1.9 | MIT/Apache-2.0 | https://github.com/sfackler/fallible-streaming-iterator |
| foldhash | 0.2.0 | Zlib | https://github.com/orlp/foldhash |
| foldhash | 0.1.5 | Zlib | https://github.com/orlp/foldhash |
| form_urlencoded | 1.2.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| getrandom | 0.4.3 | MIT OR Apache-2.0 | https://github.com/rust-random/getrandom |
| hashbrown | 0.17.1 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashbrown | 0.15.5 | MIT OR Apache-2.0 | https://github.com/rust-lang/hashbrown |
| hashlink | 0.12.2 | MIT OR Apache-2.0 | https://github.com/djc/hashlink |
| icu_collections | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_locale_core | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_normalizer_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_properties_data | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| icu_provider | 2.4.0 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| idna | 1.1.0 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| idna_adapter | 1.2.2 | Apache-2.0 OR MIT | https://github.com/hsivonen/idna_adapter |
| indexmap | 2.14.2 | Apache-2.0 OR MIT | https://github.com/indexmap-rs/indexmap |
| itoa | 1.0.18 | MIT OR Apache-2.0 | https://github.com/dtolnay/itoa |
| jni | 0.22.4 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni-macros | 0.22.4 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-rs |
| jni-sys | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| jni-sys-macros | 0.4.1 | MIT OR Apache-2.0 | https://github.com/jni-rs/jni-sys |
| libc | 0.2.191 | MIT OR Apache-2.0 | https://github.com/rust-lang/libc |
| libm | 0.2.16 | MIT | https://github.com/rust-lang/compiler-builtins |
| libsqlite3-sys | 0.39.1 | MIT | https://github.com/rusqlite/rusqlite |
| litemap | 0.8.3 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| log | 0.4.34 | MIT OR Apache-2.0 | https://github.com/rust-lang/log |
| memchr | 2.8.3 | Unlicense OR MIT | https://github.com/BurntSushi/memchr |
| percent-encoding | 2.3.2 | MIT OR Apache-2.0 | https://github.com/servo/rust-url/ |
| potential_utf | 0.1.6 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| proc-macro2 | 1.0.107 | MIT OR Apache-2.0 | https://github.com/dtolnay/proc-macro2 |
| quote | 1.0.47 | MIT OR Apache-2.0 | https://github.com/dtolnay/quote |
| rusqlite | 0.41.0 | MIT | https://github.com/rusqlite/rusqlite |
| serde | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_core | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_derive | 1.0.229 | MIT OR Apache-2.0 | https://github.com/serde-rs/serde |
| serde_json | 1.0.154 | MIT OR Apache-2.0 | https://github.com/serde-rs/json |
| simd_cesu8 | 1.2.0 | Apache-2.0 OR MIT | https://github.com/seancroach/simd_cesu8 |
| simdutf8 | 0.1.5 | MIT OR Apache-2.0 | https://github.com/rusticstuff/simdutf8 |
| smallvec | 1.16.4 | MIT OR Apache-2.0 | https://github.com/servo/rust-smallvec |
| spin | 0.9.9 | MIT | https://github.com/mvdnes/spin-rs.git |
| stable_deref_trait | 1.2.1 | MIT OR Apache-2.0 | https://github.com/storyyeller/stable_deref_trait |
| string-interner | 0.19.0 | MIT/Apache-2.0 | https://github.com/robbepop/string-interner |
| syn | 3.0.9 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| syn | 2.0.119 | MIT OR Apache-2.0 | https://github.com/dtolnay/syn |
| synstructure | 0.14.0 | MIT | https://github.com/mystor/synstructure |
| thiserror | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| thiserror-impl | 2.0.21 | MIT OR Apache-2.0 | https://github.com/dtolnay/thiserror |
| tinystr | 0.8.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| unicode-ident | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | https://github.com/dtolnay/unicode-ident |
| url | 2.5.8 | MIT OR Apache-2.0 | https://github.com/servo/rust-url |
| utf8_iter | 1.0.4 | Apache-2.0 OR MIT | https://github.com/hsivonen/utf8_iter |
| wasmi | 2.0.0 | MIT/Apache-2.0 | https://github.com/wasmi-labs/wasmi |
| wasmi_collections | 2.0.0 | MIT/Apache-2.0 | https://github.com/wasmi-labs/wasmi |
| wasmi_core | 2.0.0 | MIT/Apache-2.0 | https://github.com/wasmi-labs/wasmi |
| wasmi_ir | 2.0.0 | MIT/Apache-2.0 | https://github.com/wasmi-labs/wasmi |
| wasmparser | 0.228.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasmparser |
| writeable | 0.6.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| yoke | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| yoke-derive | 0.8.4 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerofrom | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerofrom-derive | 0.1.8 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerotrie | 0.2.5 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec | 0.11.9 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zerovec-derive | 0.11.7 | Unicode-3.0 | https://github.com/unicode-org/icu4x |
| zmij | 1.0.23 | MIT | https://github.com/dtolnay/zmij |

## JavaScript packages

The applet bundled into the APK includes these npm packages in its compiled user interface:

| Package | Version | Licence | Source |
| --- | --- | --- | --- |
| react | 19.3.1 | MIT | <https://github.com/facebook/react> |
| react-dom | 19.3.1 | MIT | <https://github.com/facebook/react> |
| scheduler | 0.28.0 | MIT | <https://github.com/facebook/react> |

It also includes `@let/sdk` and `@let/core` from this project's Let framework.

## Go

The applet backend module bundled into the APK (`servelet.wasm`) is compiled with Go 1.26.2 for `wasip1` and contains the Go runtime and standard library, licensed [BSD-3-Clause](https://go.dev/LICENSE), source at <https://go.googlesource.com/go>. It uses no third-party Go modules.

## Java and Kotlin libraries

The release runtime classpath of the Android app, with versions as resolved by Gradle:

| Library | Version | Licence | Source |
| --- | --- | --- | --- |
| `androidx.activity:activity` | 1.8.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.annotation:annotation-experimental` | 1.6.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.annotation:annotation-jvm` | 1.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.annotation:annotation` | 1.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.appcompat:appcompat-resources` | 1.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.appcompat:appcompat` | 1.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.arch.core:core-common` | 2.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.arch.core:core-runtime` | 2.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.cardview:cardview` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.collection:collection-jvm` | 1.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.collection:collection` | 1.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.concurrent:concurrent-futures-ktx` | 1.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.concurrent:concurrent-futures` | 1.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.constraintlayout:constraintlayout-core` | 1.1.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.constraintlayout:constraintlayout` | 2.2.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.coordinatorlayout:coordinatorlayout` | 1.1.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.core:core-ktx` | 1.19.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.core:core-viewtree` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.core:core` | 1.19.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.cursoradapter:cursoradapter` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.customview:customview` | 1.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.drawerlayout:drawerlayout` | 1.1.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.dynamicanimation:dynamicanimation` | 1.1.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.emoji2:emoji2-views-helper` | 1.3.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.emoji2:emoji2` | 1.3.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.exifinterface:exifinterface` | 1.3.6 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.fragment:fragment` | 1.5.4 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.graphics:graphics-shapes-android` | 1.0.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.graphics:graphics-shapes` | 1.0.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.interpolator:interpolator` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-common-jvm` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-common` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-livedata-core-ktx` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-livedata-core` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-livedata` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-process` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-runtime-android` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-runtime` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-service` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-viewmodel-android` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-viewmodel-savedstate-android` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-viewmodel-savedstate` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.lifecycle:lifecycle-viewmodel` | 2.11.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.loader:loader` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-common` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-container` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-database` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-datasource` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-decoder` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-exoplayer-hls` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-exoplayer` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.media3:media3-extractor` | 1.11.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.profileinstaller:profileinstaller` | 1.4.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.recyclerview:recyclerview` | 1.2.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.resourceinspection:resourceinspection-annotation` | 1.0.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.room:room-common-jvm` | 2.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.room:room-common` | 2.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.room:room-runtime-android` | 2.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.room:room-runtime` | 2.7.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.savedstate:savedstate-android` | 1.4.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.savedstate:savedstate` | 1.4.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.sqlite:sqlite-android` | 2.5.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.sqlite:sqlite-framework-android` | 2.5.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.sqlite:sqlite-framework` | 2.5.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.sqlite:sqlite` | 2.5.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.startup:startup-runtime` | 1.1.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.tracing:tracing-ktx` | 1.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.tracing:tracing` | 1.2.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.transition:transition` | 1.5.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.vectordrawable:vectordrawable-animated` | 1.1.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.vectordrawable:vectordrawable` | 1.1.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.versionedparcelable:versionedparcelable` | 1.1.1 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.viewpager:viewpager` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.viewpager2:viewpager2` | 1.0.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.webkit:webkit` | 1.18.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `androidx.work:work-runtime` | 2.12.0 | Apache-2.0 | <https://android.googlesource.com/platform/frameworks/support> |
| `com.google.android.material:material` | 1.14.0 | Apache-2.0 | <https://github.com/material-components/material-components-android> |
| `com.google.guava:guava` | 33.3.1-android | Apache-2.0 | <https://github.com/google/guava> |
| `com.google.guava:failureaccess` | 1.0.2 | Apache-2.0 | <https://github.com/google/guava> |
| `com.google.guava:listenablefuture` | 9999.0-empty-to-avoid-conflict-with-guava | Apache-2.0 | <https://github.com/google/guava> |
| `com.google.errorprone:error_prone_annotations` | 2.15.0 | Apache-2.0 | <https://github.com/google/error-prone> |
| `org.jetbrains.kotlin:kotlin-stdlib` | 2.4.21 | Apache-2.0 | <https://github.com/JetBrains/kotlin> |
| `org.jetbrains.kotlin:kotlin-stdlib-jdk7` | 1.9.0 | Apache-2.0 | <https://github.com/JetBrains/kotlin> |
| `org.jetbrains.kotlinx:kotlinx-coroutines-core`, `-android` | 1.9.0 | Apache-2.0 | <https://github.com/Kotlin/kotlinx.coroutines> |
| `org.jetbrains.kotlinx:kotlinx-serialization-core` | 1.7.3 | Apache-2.0 | <https://github.com/Kotlin/kotlinx.serialization> |
| `org.jetbrains:annotations` | 23.0.0 | Apache-2.0 | <https://github.com/JetBrains/java-annotations> |
| `org.jspecify:jspecify` | 1.0.0 | Apache-2.0 | <https://github.com/jspecify/jspecify> |
| `org.yaml:snakeyaml` | 2.2 | Apache-2.0 | <https://bitbucket.org/snakeyaml/snakeyaml> |
| `org.mozilla.geckoview:geckoview` | 160.0.20261104181552 | MPL-2.0 | see **GeckoView** |
| `com.google.android.gms:play-services-base` | 18.7.2 | Android Software Development Kit License (proprietary) | <https://developer.android.com/studio/terms> |
| `com.google.android.gms:play-services-basement` | 18.9.0 | Android Software Development Kit License (proprietary) | <https://developer.android.com/studio/terms> |
| `com.google.android.gms:play-services-fido` | 21.3.1 | Android Software Development Kit License (proprietary) | <https://developer.android.com/studio/terms> |
| `com.google.android.gms:play-services-tasks` | 18.3.2 | Android Software Development Kit License (proprietary) | <https://developer.android.com/studio/terms> |

The Gradle BOM entries (`kotlin-bom`, `kotlinx-coroutines-bom`, `kotlinx-serialization-bom`) contain no code.

## Licence texts

- Apache-2.0: <https://www.apache.org/licenses/LICENSE-2.0>
- MIT: <https://opensource.org/license/mit>
- MPL-2.0: <https://www.mozilla.org/MPL/2.0/>
- BSD-3-Clause: <https://opensource.org/license/bsd-3-clause>
- Zlib: <https://zlib.net/zlib_license.html>
- Unicode-3.0: <https://www.unicode.org/license.txt>
- Unlicense: <https://unlicense.org/>
- Apache-2.0 WITH LLVM-exception: <https://llvm.org/LICENSE.txt>
- LGPL-2.1: <https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html>
