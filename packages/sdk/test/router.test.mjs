import assert from "node:assert/strict";
import { describe, test } from "node:test";
// The router imports values from other SDK modules, so this test runs the built entries.
import { COMPAT } from "@genesis/core";
import { connect } from "../dist/index.js";
import { createRouter } from "../dist/router.js";

const ORIGIN = "https://news.example";
const START = `${ORIGIN}/`;
const DOCUMENT = "ui-1";
const READY_MS = 30;

const routes = [
  { id: "feed", pattern: "/", ready: { reader: "feedReady" } },
  { id: "item", pattern: "/item", query: ["id"], ready: { reader: "itemReady" } },
  { id: "hidden", pattern: "/hidden", requiresAccount: true },
  { id: "reply", pattern: "/reply", website: true },
];

/** A host that answers every request with an empty result and records it. */
function fakeHost() {
  const listeners = new Set();
  const requests = [];
  const deliver = message => { for (const listener of [...listeners]) listener(JSON.stringify(message)); };
  const transport = {
    send(text) {
      const message = JSON.parse(text);
      if (message.type === "hello") {
        queueMicrotask(() => deliver({
          type: "bound", protocol: COMPAT.protocol, compat: COMPAT, documentId: DOCUMENT, appletId: "test", revision: 1,
          contextId: null, role: "foreground", generation: 0,
          manifest: { origins: [ORIGIN], contexts: [{ id: "primary", startUrl: START }] },
          limits: { rpcDeadlineMs: 1000, actionTimeoutMs: 1000, documentReadyMs: READY_MS, historyEntriesMax: 8, backAnswerMs: 500 },
          session: null,
        }));
        return;
      }
      requests.push(message);
      queueMicrotask(() => deliver({ type: "response", documentId: DOCUMENT, requestId: message.requestId, result: {} }));
    },
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() {},
  };
  return {
    transport,
    requests,
    event: (name, data) => deliver({ type: "event", documentId: DOCUMENT, name, data }),
    methods: () => requests.map(r => r.method === "page.call" ? `${r.method}:${r.params.op}` : r.method),
  };
}

let generation = 0;
function load(host, url, { index = 0, size = index + 1 } = {}) {
  generation++;
  host.event("context.navigated", {
    id: "primary", url, generation, index, size, canGoBack: index > 0, canGoForward: index < size - 1, sameDocument: false, reload: false,
  });
  host.event("context.bound", { id: "primary", generation, url });
}

function snapshot(host, stream, url, value) {
  host.event("page.emit", {
    context: "primary", generation, stream, kind: "snapshot", seq: 1, view: { generation, n: 0, url }, url,
    data: { status: "ready", value },
  });
}

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

async function start(options = {}) {
  const host = fakeHost();
  const genesis = await connect({ transport: host.transport, url: "https://applet.local/" });
  const router = createRouter(genesis, { routes, screens: ["saved"], ...options });
  return { host, genesis, router };
}

describe("router", () => {
  test("a routed page whose ready value is truthy shows the applet", async () => {
    const { host, router } = await start();
    load(host, START);
    await tick();
    const open = host.requests.find(r => r.params?.op === "watch.open");
    assert.equal(open.params.args.id, "router:ready:feed");
    assert.equal(router.status().status, "loading");
    snapshot(host, "router:ready:feed", START, true);
    await tick(READY_MS + 20);
    assert.equal(router.status().status, "ready");
    assert.equal(router.presentation(), "custom");
    assert.deepEqual(router.screen(), { key: "primary:0", id: "feed", params: {}, context: "primary", overlay: false });
    assert.ok(!host.methods().includes("context.reveal"));
    router.destroy();
  });

  test("a page that stays loading past the deadline shows the website", async () => {
    const { host, router } = await start();
    load(host, `${ORIGIN}/item?id=7`);
    await tick();
    assert.equal(router.presentation(), "custom");
    await tick(READY_MS + 20);
    assert.equal(router.presentation(), "website");
    assert.ok(host.methods().includes("context.reveal"));
    router.destroy();
  });

  test("an unrouted URL and a website route show the website at once", async () => {
    const { host, router } = await start();
    load(host, `${ORIGIN}/reply?id=1`);
    await tick();
    assert.equal(router.revealed(), "primary");
    load(host, `${ORIGIN}/newsguidelines.html`);
    await tick();
    assert.equal(router.revealed(), "primary");
    assert.equal(router.screen(), null);
    router.destroy();
  });

  test("a page that needs the account sends a signed-out person to sign in", async () => {
    const { host, router } = await start({
      account: { signedIn: { reader: "account" }, signInUrl: url => `/login?goto=${encodeURIComponent(new URL(url).pathname)}` },
    });
    load(host, `${ORIGIN}/hidden`);
    await tick();
    snapshot(host, "router:account", `${ORIGIN}/hidden`, false);
    await tick();
    assert.equal(router.status().status, "auth");
    const navigate = host.requests.find(r => r.method === "context.navigate");
    assert.equal(navigate.params.url, `${ORIGIN}/login?goto=%2Fhidden`);
    router.destroy();
  });

  test("a page that needs the account but shows nothing about it uses the account already known", async () => {
    const { host, router } = await start({ account: { signedIn: { reader: "account" } } });
    load(host, START);
    await tick();
    snapshot(host, "router:account", START, "alice");
    await tick();
    load(host, `${ORIGIN}/hidden`);
    await tick();
    snapshot(host, "router:account", `${ORIGIN}/hidden`, null);
    await tick(READY_MS + 20);
    assert.equal(router.status().status, "ready");
    assert.equal(router.presentation(), "custom");
    router.destroy();
  });

  test("Back pops an overlay, then goes back in history, then leaves", async () => {
    const { host, router } = await start();
    load(host, `${ORIGIN}/item?id=1`, { index: 1, size: 2 });
    await tick();
    router.navigate({ screen: "saved" });
    assert.equal(router.screen().id, "saved");

    const answers = () => host.requests.filter(r => r.method === "back.handled").map(r => r.params.handled);
    host.event("back", {});
    await tick();
    assert.equal(router.screen().id, "item");
    host.event("back", {});
    await tick();
    assert.ok(host.methods().includes("context.back"));

    load(host, START, { index: 0, size: 2 });
    await tick();
    host.event("back", {});
    await tick();
    assert.deepEqual(answers(), [true, true, false]);
    router.destroy();
  });

  test("a leave guard asks before Back leaves the screen", async () => {
    const { host, router } = await start();
    load(host, START);
    await tick();
    router.navigate({ screen: "saved" });
    router.setLeaveGuard("Discard the draft?");
    const asked = [];
    router.onConfirmLeave((message, leave) => { asked.push(message); leave(); });
    host.event("back", {});
    await tick(5);
    assert.deepEqual(asked, ["Discard the draft?"]);
    assert.equal(router.screen().id, "feed");
    router.destroy();
  });

  test("the router saves its state for a recreated UI", async () => {
    const { host, router } = await start();
    load(host, START);
    await tick();
    router.navigate({ screen: "saved", params: { tab: "all" } });
    await tick(600);
    const save = host.requests.findLast(r => r.method === "session.save");
    assert.equal(save.params.version, COMPAT.sessionState);
    assert.equal(save.params.state.router.overlay[0].id, "saved");
    assert.deepEqual(save.params.state.router.overlay[0].params, { tab: "all" });
    router.destroy();
  });
});
