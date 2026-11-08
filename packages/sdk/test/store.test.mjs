import assert from "node:assert/strict";
import { describe, test } from "node:test";
// store.ts imports only types locally and values from the built @genesis/core, so Node runs it by stripping the types.
import { createStore } from "../src/store.ts";

const URL_A = "https://example.com/news";
const URL_B = "https://example.com/item?id=1";

const record = (key, data = { title: key }) => ({ key, data });

function page({ generation = 1, n = 0, url = URL_A, epoch = 1, status = "ready", account = "ann", items = ["a", "b"], error } = {}) {
  const result = {
    view: { generation, n, url }, epoch, pageId: "feed", routeId: "home", params: {}, status, account,
    regions: status === "ready" ? { stories: { kind: "collection", status: "ready", items: items.map(key => record(key)), complete: false } } : {},
  };
  if (error) result.error = error;
  return result;
}

function patch({ generation = 1, n = 0, url = URL_A, epoch = 1, base = 0, seq = base + 1, account, stories }) {
  const result = { view: { generation, n, url }, epoch, base, seq, regions: { stories: { kind: "collection", ...stories } } };
  if (account !== undefined) result.account = account;
  return result;
}

const order = (store, id = "home") => store.context(id).regions.stories.order;
const data = (store, key, id = "home") => store.context(id).regions.stories.records[key]?.data;
const outcome = result => result.outcome;

function navigate(store, id, url, index, { generation = 1, size = index + 1 } = {}) {
  store.navigated(id, { url, generation, index, size });
}

describe("store", () => {
  test("a full page, then a patch that applies only the changed records", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    assert.equal(outcome(store.applyPage("home", 1, page())), "applied");
    const before = store.context("home").regions.stories.records;
    const result = store.applyPatch("home", 1, patch({ stories: { upsert: [record("b", { title: "B2" })] } }));
    assert.equal(outcome(result), "applied");
    const after = store.context("home").regions.stories.records;
    assert.deepEqual(order(store), ["a", "b"]);
    assert.deepEqual(data(store, "b"), { title: "B2" });
    assert.equal(after.a, before.a, "an unchanged record keeps its identity");
    assert.notEqual(after.b, before.b);
    assert.equal(store.context("home").seq, 1);
  });

  test("split patches: records arrive before their key enters the order", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    store.applyPage("home", 1, page());
    assert.equal(outcome(store.applyPatch("home", 1, patch({ base: 0, stories: { upsert: [record("c")] } }))), "applied");
    assert.deepEqual(order(store), ["a", "b"], "c is held but not ordered yet");
    assert.ok(data(store, "c"));
    assert.equal(outcome(store.applyPatch("home", 1, patch({ base: 1, stories: { upsert: [record("d")] } }))), "applied");
    const final = patch({ base: 2, stories: { upsert: [record("e")], order: ["a", "c", "d", "e"], complete: true } });
    assert.equal(outcome(store.applyPatch("home", 1, final)), "applied");
    assert.deepEqual(order(store), ["a", "c", "d", "e"]);
    assert.equal(data(store, "b"), undefined, "a key the final order leaves out is gone");
    assert.equal(store.context("home").regions.stories.complete, true);
  });

  test("a patch with a stale epoch, a wrong base or a gap in seq asks for a resync", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    store.applyPage("home", 1, page({ epoch: 2 }));
    const upsert = { upsert: [record("a", { title: "changed" })] };
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 1, stories: upsert }))), "resync");
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 2, base: 3, stories: upsert }))), "resync");
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 2, base: 0, seq: 1, stories: upsert }))), "applied");
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 2, base: 2, seq: 3, stories: upsert }))), "resync", "seq 2 is missing");
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 2, n: 1, base: 1, stories: upsert }))), "resync", "another view");
    assert.equal(store.context("home").seq, 1);
    assert.deepEqual(data(store, "a"), { title: "changed" }, "only the patch that fits applied");
  });

  test("a full page with a higher epoch is accepted and restarts seq", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    store.applyPage("home", 1, page({ epoch: 1 }));
    store.applyPatch("home", 1, patch({ stories: { upsert: [record("a", { title: "x" })] } }));
    assert.equal(outcome(store.applyPage("home", 1, page({ epoch: 2, items: ["z"] }))), "applied");
    assert.deepEqual(order(store), ["z"]);
    assert.equal(store.context("home").epoch, 2);
    assert.equal(store.context("home").seq, 0);
    assert.equal(outcome(store.applyPatch("home", 1, patch({ epoch: 2, base: 0, stories: { remove: ["z"] } }))), "applied");
  });

  test("a page or patch for an older generation is dropped", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    store.applyPage("home", 2, page({ generation: 2, items: ["new"] }));
    assert.equal(outcome(store.applyPage("home", 1, page({ generation: 1, items: ["old"] }))), "dropped");
    assert.equal(outcome(store.applyPatch("home", 1, patch({ generation: 1, stories: { upsert: [record("old")] } }))), "dropped");
    navigate(store, "home", URL_A, 0, { generation: 3 });
    assert.equal(outcome(store.applyPage("home", 2, page({ generation: 2 }))), "dropped", "a navigation reported a newer document");
    assert.deepEqual(order(store), ["new"]);
  });

  test("remove deletes records and their keys", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    store.applyPage("home", 1, page({ items: ["a", "b", "c"] }));
    assert.equal(outcome(store.applyPatch("home", 1, patch({ stories: { remove: ["b"] } }))), "applied");
    assert.deepEqual(order(store), ["a", "c"]);
    assert.equal(data(store, "b"), undefined);
  });

  test("an error page keeps the stale ready page", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    navigate(store, "home", URL_A, 0);
    store.applyPage("home", 1, page());
    const error = { code: "NOT_READY", message: "The page failed" };
    assert.equal(outcome(store.applyPage("home", 1, page({ epoch: 2, status: "error", error }))), "applied");
    const context = store.context("home");
    assert.equal(context.status, "error");
    assert.deepEqual(context.error, error);
    assert.equal(context.stale, true);
    assert.deepEqual(order(store), ["a", "b"]);
  });

  test("Back shows the history entry as stale until its document publishes", () => {
    const store = createStore(["home"], { historyEntriesMax: 16 });
    navigate(store, "home", URL_A, 0);
    store.applyPage("home", 1, page());
    navigate(store, "home", URL_B, 1, { generation: 2 });
    assert.equal(store.context("home").content, false, "a new entry starts empty");
    store.applyPage("home", 2, page({ generation: 2, url: URL_B, items: ["item"] }));
    navigate(store, "home", URL_A, 0, { generation: 3, size: 2 });
    let context = store.context("home");
    assert.equal(context.stale, true);
    assert.equal(context.status, "loading");
    assert.deepEqual(order(store), ["a", "b"]);
    store.applyPage("home", 3, page({ generation: 3, items: ["fresh"] }));
    context = store.context("home");
    assert.equal(context.stale, false);
    assert.deepEqual(order(store), ["fresh"]);
  });

  test("an account change clears history and marks the other context stale", () => {
    const store = createStore(["home", "me"], { historyEntriesMax: 16 });
    navigate(store, "home", URL_A, 0);
    store.applyPage("home", 1, page({ account: null }));
    navigate(store, "me", URL_B, 0);
    assert.equal(store.applyPage("me", 1, page({ url: URL_B, account: null })).accountChanged, false, "same account");
    navigate(store, "me", URL_A, 1, { generation: 2 });
    assert.equal(store.context("me").history.size, 1);

    // A page still loading is no evidence of the account.
    assert.equal(store.applyPage("me", 2, page({ generation: 2, status: "loading", account: "ann" })).accountChanged, false);
    const result = store.applyPage("me", 2, page({ generation: 2, epoch: 2, account: "ann" }));
    assert.equal(result.accountChanged, true);
    assert.equal(store.state().account, "ann");
    assert.equal(store.context("home").stale, true);
    assert.equal(store.context("home").history.size, 0);
    assert.equal(store.context("me").stale, false);
    assert.deepEqual([...store.context("me").history.keys()], [1], "only the reporter's current page is kept");

    const signOut = store.applyPatch("me", 2, patch({ generation: 2, epoch: 2, account: null, stories: { remove: ["a"] } }));
    assert.equal(signOut.accountChanged, true, "a patch reports the account too");
    assert.equal(store.state().account, null);
  });

  test("history entries are bounded and dropped when the URL at their index changes", () => {
    const store = createStore(["home"], { historyEntriesMax: 2 });
    for (let i = 0; i < 3; i++) {
      const url = `https://example.com/item?id=${i}`;
      navigate(store, "home", url, i, { generation: i + 1 });
      store.applyPage("home", i + 1, page({ generation: i + 1, url }));
    }
    assert.deepEqual([...store.context("home").history.keys()], [1, 2]);
    navigate(store, "home", "https://example.com/other", 1, { generation: 4, size: 2 });
    assert.deepEqual([...store.context("home").history.keys()], [], "index 1 shows another URL; index 2 is past the list");
  });

  test("listeners hear their context only", () => {
    const store = createStore(["home", "me"], { historyEntriesMax: 16 });
    const heard = [];
    store.subscribe(() => heard.push("home"), "home");
    store.subscribe(() => heard.push("any"));
    store.applyPage("me", 1, page());
    store.applyPage("home", 1, page());
    assert.deepEqual(heard, ["any", "any", "home"]);
  });
});
