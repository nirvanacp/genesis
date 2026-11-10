/**
 * The version of every serialized boundary. Only the developer changes these values;
 * `crates/contracts` holds the same constants and `tools/check-packages.mjs` compares the two.
 */
export const COMPAT = {
  manifestSchema: 6,     // applet.json shape
  bundleFormat: 3,       // bundle.json
  protocol: 1,           // document ↔ host messages (hello, bound, requests, events)
  adapterApi: 1,         // defineAdapter, regions, actions, patch stream
  sessionState: 1,       // session.save payload
  importEnvelope: 1,     // the import file around a bundle
  credentialEnvelope: 1, // service credential import file
  cookieEnvelope: 1,     // development cookie import file (debug builds)
  packagesIndex: 1,      // genesis.packages.json
} as const;

export type Compat = typeof COMPAT;

/** The version of @genesis/core, @genesis/sdk, @genesis/applet-tools and the kit. */
export const FRAMEWORK_VERSION = "0.0.0";
