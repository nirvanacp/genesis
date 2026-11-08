import assert from "node:assert/strict";
import { describe, test } from "node:test";
// diff.ts has only type imports, so Node runs it directly by stripping the types.
import { assignKeys, diffRegion, mergeVirtualized } from "../src/adapter/diff.ts";

const record = (key, data = { title: key }) => ({ key, data });
const collection = (items, extra = {}) => ({ kind: "collection", status: "ready", items, complete: true, ...extra });

describe("diffRegion", () => {
  test("two equal record maps yield nothing", () => {
    assert.equal(diffRegion(collection([record("a"), record("b")]), collection([record("a"), record("b")])), null);
  });

  test("a changed record yields only its key", () => {
    const patch = diffRegion(
      collection([record("a"), record("b"), record("c")]),
      collection([record("a"), record("b", { title: "changed" }), record("c")]),
    );
    assert.deepEqual(patch, { kind: "collection", upsert: [record("b", { title: "changed" })] });
  });

  test("an added record is upserted and the new order sent", () => {
    const patch = diffRegion(collection([record("a")]), collection([record("a"), record("b")]));
    assert.deepEqual(patch, { kind: "collection", upsert: [record("b")], order: ["a", "b"] });
  });

  test("a removed record is removed and the new order sent", () => {
    const patch = diffRegion(collection([record("a"), record("b")]), collection([record("b")]));
    assert.deepEqual(patch, { kind: "collection", remove: ["a"], order: ["b"] });
  });

  test("a reorder sends only the order", () => {
    const patch = diffRegion(collection([record("a"), record("b")]), collection([record("b"), record("a")]));
    assert.deepEqual(patch, { kind: "collection", order: ["b", "a"] });
  });

  test("complete, status and error changes are carried; a cleared error is null", () => {
    const error = { code: "INVALID_ARGUMENT", message: "broken" };
    assert.deepEqual(
      diffRegion(collection([]), collection([], { complete: false, status: "error", error })),
      { kind: "collection", complete: false, status: "error", error },
    );
    assert.deepEqual(
      diffRegion(collection([], { status: "error", error }), collection([])),
      { kind: "collection", status: "ready", error: null },
    );
  });

  test("an ephemeral region is replaced whole", () => {
    const next = collection([record("0"), record("1")], { ephemeral: true });
    assert.deepEqual(diffRegion(collection([record("a")]), next), { kind: "replace", region: next });
    assert.equal(diffRegion(next, collection([record("0"), record("1")], { ephemeral: true })), null);
  });

  test("a single region sends its record when it changes", () => {
    const single = data => ({ kind: "single", status: "ready", record: data === null ? null : record("post", data) });
    assert.equal(diffRegion(single({ n: 1 }), single({ n: 1 })), null);
    assert.deepEqual(diffRegion(single({ n: 1 }), single({ n: 2 })), { kind: "single", record: record("post", { n: 2 }) });
    assert.deepEqual(diffRegion(single({ n: 1 }), single(null)), { kind: "single", record: null });
  });

  test("a kind change replaces the region", () => {
    const next = { kind: "single", status: "ready", record: null };
    assert.deepEqual(diffRegion(collection([]), next), { kind: "replace", region: next });
  });
});

describe("mergeVirtualized", () => {
  const keys = records => records.map(r => r.key);

  test("keys that left the DOM stay, and records read again replace old ones", () => {
    const merged = mergeVirtualized([record("a"), record("b"), record("c")], [record("c", { title: "new" }), record("d")]);
    assert.deepEqual(keys(merged), ["a", "b", "c", "d"]);
    assert.deepEqual(merged[2].data, { title: "new" });
  });

  test("a new key goes after its earlier neighbour", () => {
    assert.deepEqual(keys(mergeVirtualized([record("a"), record("c")], [record("a"), record("b"), record("c")])), ["a", "b", "c"]);
  });

  test("a new key with no earlier neighbour goes before its later one", () => {
    assert.deepEqual(keys(mergeVirtualized([record("b"), record("c")], [record("a"), record("c")])), ["b", "a", "c"]);
  });
});

describe("assignKeys", () => {
  test("unique keys are kept", () => {
    assert.deepEqual(assignKeys(["a", "b"]), { keys: ["a", "b"], ephemeral: false });
  });

  test("a repeated key makes every key positional", () => {
    assert.deepEqual(assignKeys(["a", "b", "a"]), { keys: ["0", "1", "2"], ephemeral: true });
  });
});
