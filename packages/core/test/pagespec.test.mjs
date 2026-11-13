import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { InvalidSpecError, matchesGuard, validateGuards, validateLocator, validateReadSpec } from "../dist/index.js";

function rejects(fn, pattern) {
  assert.throws(fn, error => error instanceof InvalidSpecError && error.code === "INVALID_ARGUMENT" && pattern.test(error.message));
}

describe("validateLocator", () => {
  test("accepts each kind of root", () => {
    validateLocator({ css: "a.story" });
    validateLocator({ text: "More", exact: true });
    validateLocator({ role: "button", name: "Upvote" });
    validateLocator({ record: { watch: "feed", key: "123" }, css: ".votearrow" });
  });

  test("needs css, text, role or record", () => {
    rejects(() => validateLocator({ nth: 1 }), /needs one of css, text, role or record/);
    rejects(() => validateLocator("a.story"), /must be an object/);
  });

  test("refuses unknown fields and dependent fields alone", () => {
    rejects(() => validateLocator({ css: "a", xpath: "//a" }), /unknown field xpath/);
    rejects(() => validateLocator({ css: "a", name: "x" }), /name: needs role/);
    rejects(() => validateLocator({ css: "a", exact: true }), /exact: needs text/);
    rejects(() => validateLocator({ css: "a", nth: 1.5 }), /nth: must be an integer/);
    rejects(() => validateLocator({ record: { watch: "feed" } }), /record: must be/);
  });

  test("limits within, has and frame to four levels together", () => {
    const four = { css: "a", within: { css: "b", has: { css: "c", frame: { css: "d", within: { css: "e" } } } } };
    validateLocator(four);
    const five = { css: "a", within: { css: "b", has: { css: "c", frame: { css: "d", within: { css: "e", has: { css: "f" } } } } } };
    rejects(() => validateLocator(five), /nests deeper than 4 levels/);
  });
});

describe("validateReadSpec", () => {
  test("accepts one, list and reader", () => {
    validateReadSpec({ one: { css: "#me" }, fields: { name: { take: "text" }, karma: { at: ".karma", take: "number" } } });
    validateReadSpec({
      list: { css: "tr.athing" },
      key: { take: { attr: "id" } },
      fields: { title: { at: ".titleline a", take: "text", max: 300 }, links: { at: "a", all: true, fields: { href: { take: "url" } } } },
      virtualized: true,
      limit: 50,
    });
    validateReadSpec({ reader: "feed", args: { page: 2 } });
  });

  test("a field has take or fields, not both or neither", () => {
    rejects(() => validateReadSpec({ one: { css: "a" }, fields: { x: { at: "b" } } }), /exactly one of take and fields/);
    rejects(() => validateReadSpec({ one: { css: "a" }, fields: { x: { take: "text", fields: {} } } }), /exactly one of take and fields/);
    rejects(() => validateReadSpec({ one: { css: "a" }, fields: { x: { take: "html" } } }), /take: must be one of/);
  });

  test("a list key reads one value", () => {
    rejects(() => validateReadSpec({ list: { css: "li" }, key: { take: "text", all: true }, fields: {} }), /key: must read one value/);
    rejects(() => validateReadSpec({ list: { css: "li" }, key: { take: "rect" }, fields: {} }), /cannot be read with take rect/);
  });

  test("refuses missing kinds, bad limits and deep nesting", () => {
    rejects(() => validateReadSpec({ fields: {} }), /needs one of one, list or reader/);
    rejects(() => validateReadSpec({ list: { css: "li" }, key: { take: "text" }, fields: {}, limit: 0 }), /limit: must be a positive integer/);
    rejects(() => validateReadSpec({ one: { css: "a" }, fields: { x: { take: "text", max: 5000 } } }), /max: must be an integer from 1 to 2000/);
    let fields = { leaf: { take: "text" } };
    for (let i = 0; i < 4; i++) fields = { nested: { fields } };
    rejects(() => validateReadSpec({ one: { css: "a" }, fields }), /nests deeper than 4 levels/);
    rejects(() => validateReadSpec({ one: { nth: 0 }, fields: {} }), /spec.one: needs one of/);
  });
});

describe("URL guards", () => {
  test("validateGuards checks patterns and query keys", () => {
    validateGuards([{ pattern: "/item", query: ["id"] }, { pattern: "/:handle/status/:id" }]);
    rejects(() => validateGuards([]), /non-empty array/);
    rejects(() => validateGuards([{ pattern: "item" }]), /is not a route pattern/);
    rejects(() => validateGuards([{ pattern: "/x", query: [1] }]), /array of query keys/);
  });

  test("matchesGuard matches path patterns and required query keys", () => {
    const guards = [{ pattern: "/item", query: ["id"] }, { pattern: "/explore/*" }];
    assert.equal(matchesGuard("https://news.ycombinator.com/item?id=1", guards), true);
    assert.equal(matchesGuard("https://news.ycombinator.com/item", guards), false);
    assert.equal(matchesGuard("https://x.com/explore/tabs/news", guards), true);
    assert.equal(matchesGuard("https://x.com/home", guards), false);
    assert.equal(matchesGuard("not a url", guards), false);
  });
});
