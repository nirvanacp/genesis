import assert from "node:assert/strict";
import { describe, test } from "node:test";
// watch.ts has only type imports, so Node runs it directly by stripping the types.
import { createWatchStore } from "../src/client/watch.ts";

const URL_A = "https://example.com/a";
const URL_B = "https://example.com/b";
const view = (generation, n, url) => ({ generation, n, url });
const emit = (kind, seq, data, { generation = 1, n = 0, url = URL_A } = {}) =>
  ({ context: "primary", generation, stream: "items", kind, seq, view: view(generation, n, url), url, data });
const list = (keys, extra = {}) => ({
  status: "ready",
  order: keys,
  records: Object.fromEntries(keys.map(key => [key, { title: key }])),
  ...extra,
});
const navigated = (generation, index, url, { size = index + 1, sameDocument = false } = {}) => ({
  id: "primary", url, generation, index, size, canGoBack: index > 0, canGoForward: index < size - 1, sameDocument, reload: false,
});

function store() {
  const s = createWatchStore({ historyEntriesMax: 4 });
  s.navigated(navigated(1, 0, URL_A));
  return s;
}

describe("watch store", () => {
  test("a snapshot makes the watch ready", () => {
    const s = store();
    assert.equal(s.get().status, "loading");
    assert.equal(s.emit(emit("snapshot", 1, list(["a", "b"]))), "applied");
    const value = s.get();
    assert.equal(value.status, "ready");
    assert.deepEqual(value.order, ["a", "b"]);
    assert.deepEqual(value.records.a, { title: "a" });
  });

  test("an in-order patch applies, and unchanged records keep their object", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a", "b"])));
    const before = s.get();
    assert.equal(s.emit(emit("patch", 2, { upsert: { b: { title: "B" }, c: { title: "c" } }, order: ["a", "b", "c"] })), "applied");
    const after = s.get();
    assert.notEqual(after, before);
    assert.equal(after.records.a, before.records.a);
    assert.deepEqual(after.records.b, { title: "B" });
    assert.deepEqual(after.order, ["a", "b", "c"]);
  });

  test("a patch with a gap in seq asks for a resync and changes nothing", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    const before = s.get();
    assert.equal(s.emit(emit("patch", 3, { remove: ["a"], order: [] })), "resync");
    assert.equal(s.get(), before);
  });

  test("a patch for another view asks for a resync", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    assert.equal(s.emit(emit("patch", 2, { remove: ["a"] }, { n: 1 })), "resync");
  });

  test("split patches: records arrive before their key enters the order", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a", "b"], { complete: false })));
    assert.equal(s.emit(emit("patch", 2, { upsert: { c: { title: "c" } } })), "applied");
    assert.deepEqual(s.get().order, ["a", "b"], "c is held but not ordered yet");
    assert.deepEqual(s.get().records.c, { title: "c" });
    assert.equal(s.emit(emit("patch", 3, { upsert: { d: { title: "d" } }, remove: ["b"], order: ["a", "c", "d"], complete: true })), "applied");
    assert.deepEqual(s.get().order, ["a", "c", "d"]);
    assert.equal(s.get().records.b, undefined, "a removed key loses its record");
    assert.equal(s.get().complete, true);
  });

  test("a message the stream already passed is ignored", () => {
    const s = store();
    s.emit(emit("snapshot", 2, list(["a"])));
    const before = s.get();
    assert.equal(s.emit(emit("snapshot", 1, list(["old"]))), "ignored");
    assert.equal(s.get(), before);
  });

  test("a snapshot of a new document restarts the stream", () => {
    const s = store();
    s.emit(emit("snapshot", 5, list(["a"])));
    s.navigated(navigated(2, 0, URL_A));
    assert.equal(s.emit(emit("snapshot", 1, list(["z"]), { generation: 2 })), "applied");
    assert.deepEqual(s.get().order, ["z"]);
    assert.equal(s.emit(emit("patch", 2, { remove: ["z"], order: [] }, { generation: 2 })), "applied");
  });

  test("a snapshot with the same data keeps the same value object", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a", "b"])));
    const before = s.get();
    s.emit(emit("snapshot", 2, list(["a", "b"])));
    assert.equal(s.get(), before);
  });

  test("a single read keeps its value object while its JSON is unchanged", () => {
    const s = store();
    s.emit(emit("snapshot", 1, { status: "ready", value: { title: "x" } }));
    const before = s.get().value;
    s.emit(emit("snapshot", 2, { status: "ready", value: { title: "x" } }));
    assert.equal(s.get().value, before);
  });

  test("Back shows the entry's earlier data, stale, until the new document's snapshot", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    s.navigated(navigated(2, 1, URL_B));
    assert.equal(s.get().status, "loading");
    assert.equal(s.get().order.length, 0);
    s.emit(emit("snapshot", 1, list(["x"]), { generation: 2, url: URL_B }));
    s.navigated(navigated(3, 0, URL_A, { size: 2 }));
    const back = s.get();
    assert.equal(back.stale, true);
    assert.deepEqual(back.order, ["a"]);
    s.emit(emit("snapshot", 1, list(["a", "new"]), { generation: 3 }));
    assert.equal(s.get().stale, false);
    assert.deepEqual(s.get().order, ["a", "new"]);
  });

  test("a reload keeps the data, stale", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    s.navigated(navigated(2, 0, URL_A));
    assert.equal(s.get().stale, true);
    assert.deepEqual(s.get().order, ["a"]);
  });

  test("an entry replaced by another URL is forgotten", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    s.navigated(navigated(2, 1, URL_B));
    s.navigated(navigated(3, 0, URL_B, { size: 2 }));
    s.navigated(navigated(4, 0, URL_A, { size: 2 }));
    assert.equal(s.get().order.length, 0);
    assert.equal(s.get().stale, false);
  });

  test("history keeps at most historyEntriesMax entries", () => {
    const s = createWatchStore({ historyEntriesMax: 1 });
    s.navigated(navigated(1, 0, URL_A));
    s.emit(emit("snapshot", 1, list(["a"])));
    s.navigated(navigated(2, 1, URL_B));
    s.emit(emit("snapshot", 1, list(["b"]), { generation: 2, url: URL_B }));
    s.navigated(navigated(3, 0, URL_A, { size: 2 }));
    assert.equal(s.get().order.length, 0);
  });

  test("an error snapshot keeps the last data of the same URL, stale", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    s.emit(emit("snapshot", 2, { status: "error", error: { code: "CONFLICT", message: "dup" } }));
    const value = s.get();
    assert.equal(value.status, "error");
    assert.equal(value.stale, true);
    assert.deepEqual(value.order, ["a"]);
    assert.equal(value.error.code, "CONFLICT");
  });

  test("an idle status marks the watch idle", () => {
    const s = store();
    s.emit(emit("status", 1, { idle: true }));
    assert.equal(s.get().idle, true);
  });

  test("gone keeps the data, stale, with the error", () => {
    const s = store();
    s.emit(emit("snapshot", 1, list(["a"])));
    s.gone({ code: "NOT_READY", message: "gone" });
    assert.equal(s.get().status, "error");
    assert.equal(s.get().stale, true);
  });

  test("subscribers hear changes only", () => {
    const s = store();
    let calls = 0;
    s.subscribe(() => calls++);
    s.emit(emit("snapshot", 1, list(["a"])));
    s.emit(emit("snapshot", 2, list(["a"])));
    assert.equal(calls, 1);
  });
});
