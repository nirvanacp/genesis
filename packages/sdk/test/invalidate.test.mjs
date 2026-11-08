import assert from "node:assert/strict";
import { describe, test } from "node:test";
// invalidate.ts has no imports, so Node runs it directly by stripping the types.
import { invalidate, touches } from "../src/adapter/invalidate.ts";

// A tree of plain nodes: document > body > list > (a > a-title, b > b-title), body > a-comments, body > header.
const node = parentNode => ({ parentNode });
const document = node(null);
const body = node(document);
const list = node(body);
const a = node(list);
const aTitle = node(a);
const b = node(list);
const bTitle = node(b);
const aComments = node(body); // Item a's extent, outside the root.
const header = node(body);

function region(overrides = {}) {
  const items = new Map([[a, "a"], [b, "b"], [aComments, "a"]]);
  return { root: list, items, dependsOn: [], dependsOnMissing: false, fields: false, measure: false, ...overrides };
}

const only = (result, name = "list") => {
  assert.deepEqual([...result.keys()], [name]);
  const value = result.get(name);
  return { keys: [...value.keys], whole: value.whole, membership: value.membership, resolve: value.resolve };
};

describe("invalidate", () => {
  test("a change inside an item returns only that key", () => {
    const result = invalidate({ list: region() }, [{ target: bTitle, kind: "characterData" }], document);
    assert.deepEqual(only(result), { keys: ["b"], whole: false, membership: false, resolve: false });
  });

  test("a change inside an item's extent returns only that item", () => {
    const comment = node(aComments);
    const result = invalidate({ list: region() }, [{ target: comment, kind: "attributes" }], document);
    assert.deepEqual(only(result), { keys: ["a"], whole: false, membership: false, resolve: false });
  });

  test("a change in the root outside every item returns the whole region", () => {
    const between = node(list);
    const result = invalidate({ list: region() }, [{ target: between, kind: "attributes" }], document);
    assert.equal(only(result).whole, true);
  });

  test("a change outside the root and every extent returns nothing", () => {
    assert.equal(invalidate({ list: region() }, [{ target: header, kind: "attributes" }], document).size, 0);
  });

  test("a change in a dependsOn node returns the whole region", () => {
    const result = invalidate({ list: region({ dependsOn: [header] }) }, [{ target: node(header), kind: "characterData" }], document);
    assert.equal(only(result).whole, true);
  });

  test("a childList change in the root re-queries membership", () => {
    const result = invalidate({ list: region() }, [{ target: list, kind: "childList" }], document);
    const value = only(result);
    assert.equal(value.membership, true);
  });

  test("a missing root is resolved again once nodes are added", () => {
    const missing = region({ root: null, items: new Map() });
    assert.equal(only(invalidate({ list: missing }, [{ target: body, kind: "childList" }], document)).resolve, true);
    assert.equal(invalidate({ list: missing }, [{ target: body, kind: "attributes" }], document).size, 0);
  });

  test("a detached root is resolved again", () => {
    const detached = node(node(null));
    const result = invalidate({ list: region({ root: detached }) }, [{ target: header, kind: "attributes" }], document);
    assert.equal(only(result).resolve, true);
  });

  test("a removed extent outside the root invalidates its item", () => {
    const removed = node(null); // An extent of item a, now detached.
    const items = new Map([[a, "a"], [b, "b"], [removed, "a"]]);
    const result = invalidate({ list: region({ items }) }, [{ target: removed, kind: "childList", removed: true }], document);
    assert.deepEqual(only(result), { keys: ["a"], whole: false, membership: true, resolve: false });
  });

  test("a removed node that holds the root and was put back reads the whole region", () => {
    const result = invalidate({ list: region() }, [{ target: body, kind: "childList", removed: true }], document);
    assert.equal(only(result).whole, true);
  });

  test("touches: only changes in the root, an extent or a dependsOn node count", () => {
    assert.equal(touches(region(), aTitle), true);
    assert.equal(touches(region(), aComments), true);
    assert.equal(touches(region(), header), false);
    assert.equal(touches(region({ dependsOn: [header] }), header), true);
  });

  test("field and size changes count only for regions that ask for them", () => {
    assert.equal(invalidate({ list: region() }, [{ target: aTitle, kind: "field" }], document).size, 0);
    assert.deepEqual(only(invalidate({ list: region({ fields: true }) }, [{ target: aTitle, kind: "field" }], document)).keys, ["a"]);
    assert.equal(invalidate({ list: region() }, [{ target: a, kind: "resize" }], document).size, 0);
    assert.deepEqual(only(invalidate({ list: region({ measure: true }) }, [{ target: a, kind: "resize" }], document)).keys, ["a"]);
  });
});
