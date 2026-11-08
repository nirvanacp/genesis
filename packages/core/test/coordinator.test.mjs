import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { initialState, presentation, reduce, restore, revealed, serialize } from "../dist/index.js";

const HN = "https://news.ycombinator.com";
const manifest = {
  schemaVersion: 6,
  id: "hn",
  name: "Hacker News",
  origins: [HN],
  foreground: { entry: "src/main.tsx", screens: ["feed", "item", "user", "post", "me", "saved"] },
  adapter: "src/adapter.ts",
  contexts: [
    { id: "primary", startUrl: `${HN}/` },
    { id: "post", startUrl: `${HN}/submit` },
    { id: "me", startUrl: `${HN}/news?account=1` },
  ],
  routes: [
    { id: "home", pattern: "/", page: "feed", screen: "feed", context: "primary" },
    { id: "item", pattern: "/item", query: ["id"], page: "item", screen: "item" },
    { id: "user", pattern: "/user", query: ["id"], page: "user", screen: "user" },
    { id: "submit", pattern: "/submit", page: "submit", screen: "post", context: "post" },
    { id: "account", pattern: "/news", query: ["account"], page: "account", screen: "me", context: "me" },
    { id: "news", pattern: "/news", page: "feed", screen: "feed" },
  ],
  capabilities: {},
};

/** Drives the reducer and remembers the state, the last effects and each context's generation and history. */
function session(state = initialState(manifest)) {
  const generations = {};
  const histories = {};
  const self = {
    state,
    effects: [],
    send(event) {
      const result = reduce(self.state, event, manifest);
      self.state = result.state;
      self.effects = result.effects;
      return result.effects;
    },
    /** A committed cross-document navigation: a new generation, a new history entry (or the entry `index`). */
    commit(id, path, index) {
      const history = (histories[id] ??= []);
      const at = index ?? history.length;
      if (index === undefined) history.push(path);
      generations[id] = (generations[id] ?? 0) + 1;
      return self.send({
        type: "context.navigated", id, url: HN + path, generation: generations[id], index: at, size: history.length,
        canGoBack: at > 0, canGoForward: at < history.length - 1, sameDocument: false, reload: false,
      });
    },
    page(id, path, status, extra = {}) {
      return self.send({
        type: "context.page", id, generation: generations[id], view: { generation: generations[id], n: 0, url: HN + path },
        status, pageId: null, routeId: null, account: null, stale: false, ...extra,
      });
    },
    /** What the user sees: the overlay, or the active context's presentation. */
    shown() {
      return self.state.overlay.length > 0 ? "overlay" : presentation(self.state.contexts[self.state.active], manifest);
    },
    context(id = self.state.active) {
      return self.state.contexts[id];
    },
  };
  return self;
}

const types = effects => effects.map(effect => effect.type);

describe("section 5.5 scenarios", () => {
  test("1: custom feed, website page, back through both, leave", () => {
    const s = session();
    assert.equal(s.shown(), "custom");
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    assert.equal(s.shown(), "custom");

    assert.deepEqual(s.send({ type: "navigate.url", url: `${HN}/changepw`, mode: "push" }),
      [{ type: "context.navigate", id: "primary", url: `${HN}/changepw`, mode: "push" }]);
    assert.ok(types(s.commit("primary", "/changepw")).includes("reveal"));
    s.page("primary", "/changepw", "unsupported");
    assert.equal(s.shown(), "website");

    assert.ok(types(s.commit("primary", "/")).includes("cover"), "tapping Hacker News covers the website");
    s.page("primary", "/", "ready");
    assert.equal(s.shown(), "custom");

    assert.deepEqual(s.send({ type: "back" }), [{ type: "context.back", id: "primary" }]);
    assert.ok(types(s.commit("primary", "/changepw", 1)).includes("reveal"));
    assert.deepEqual(s.send({ type: "back" }), [{ type: "context.back", id: "primary" }]);
    assert.ok(types(s.commit("primary", "/", 0)).includes("cover"));
    s.page("primary", "/", "ready");
    assert.equal(s.shown(), "custom");
    assert.deepEqual(s.send({ type: "back" }), [{ type: "leave" }]);
  });

  test("2: View website pins the website across routes until Done", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    assert.deepEqual(s.send({ type: "user.viewWebsite", id: "primary" }), [{ type: "reveal", id: "primary" }]);
    for (const path of ["/item?id=1", "/user?id=pg", "/item?id=2"]) {
      assert.ok(!types(s.commit("primary", path)).includes("cover"));
      assert.deepEqual(s.page("primary", path, "ready"), []);
      assert.equal(s.shown(), "website");
    }
    assert.deepEqual(s.send({ type: "user.done", id: "primary" }), [{ type: "cover" }]);
    assert.equal(s.shown(), "custom");
    assert.equal(s.context().url, `${HN}/item?id=2`);
  });

  test("Done on an unpinned website page goes back, or to the start page without history", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    s.commit("primary", "/reply?id=1");
    assert.equal(s.shown(), "website");
    assert.deepEqual(s.send({ type: "user.done", id: "primary" }), [{ type: "context.back", id: "primary" }]);

    const t = session();
    t.commit("primary", "/reply?id=1");
    assert.deepEqual(t.send({ type: "user.done", id: "primary" }),
      [{ type: "context.navigate", id: "primary", url: `${HN}/`, mode: "push" }]);
    t.commit("primary", "/");
    t.page("primary", "/", "ready");
    assert.deepEqual(t.send({ type: "user.done", id: "primary" }), [], "Done on a custom screen does nothing");

    const u = session();
    u.commit("primary", "/");
    u.page("primary", "/", "ready");
    u.send({ type: "user.viewWebsite", id: "primary" });
    u.commit("primary", "/submitted?id=pg");
    assert.deepEqual(u.send({ type: "user.done", id: "primary" }), [{ type: "context.back", id: "primary" }],
      "a pin on an unrouted page clears and leaves in one Done");
    assert.equal(u.context().pin, "none");
  });

  test("3: a page that needs an account signs in, then returns to custom", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    s.send({ type: "select", id: "me" });
    s.commit("me", "/news?account=1");
    const effects = s.page("me", "/news?account=1", "auth", { signInUrl: `${HN}/login?goto=news%3Faccount%3D1` });
    assert.deepEqual(effects, [
      { type: "context.navigate", id: "me", url: `${HN}/login?goto=news%3Faccount%3D1`, mode: "push" },
      { type: "reveal", id: "me" },
    ]);
    assert.equal(s.context().pin, "auth");
    s.commit("me", "/login?goto=news%3Faccount%3D1");
    s.page("me", "/login?goto=news%3Faccount%3D1", "unsupported");
    assert.equal(s.shown(), "website");
    s.commit("me", "/news?account=1");
    assert.equal(s.shown(), "website", "the pin holds while the redirect loads");
    assert.deepEqual(s.page("me", "/news?account=1", "ready", { account: "someone" }), [{ type: "cover" }]);
    assert.equal(s.context().pin, "none");
  });

  test("4: a comment posted in the website returns to the custom item", () => {
    const s = session();
    s.commit("primary", "/comment");
    s.page("primary", "/comment", "unsupported");
    assert.equal(s.shown(), "website");
    assert.ok(types(s.commit("primary", "/item?id=7")).includes("cover"));
    s.page("primary", "/item?id=7", "ready");
    assert.equal(s.shown(), "custom");
  });

  test("5: repeated pages for the shown view change nothing", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    for (let i = 0; i < 5; i++) assert.deepEqual(s.page("primary", "/", "ready"), []);
    assert.equal(s.shown(), "custom");
  });

  test("6: the feed adapts in the Post context, Back returns to submit", () => {
    const s = session();
    s.send({ type: "select", id: "post" });
    s.commit("post", "/submit");
    assert.deepEqual(s.page("post", "/submit", "error"), [{ type: "reveal", id: "post" }]);
    assert.ok(types(s.commit("post", "/")).includes("cover"));
    s.page("post", "/", "ready");
    assert.equal(s.shown(), "custom");
    assert.equal(s.state.active, "post");
    assert.deepEqual(s.send({ type: "back" }), [{ type: "context.back", id: "post" }]);
    s.commit("post", "/submit", 0);
    s.page("post", "/submit", "error");
    assert.equal(s.shown(), "website");
  });

  test("7: an article on an undeclared origin shows as website in the same context", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    s.send({ type: "navigate.url", url: "https://example.com/article", mode: "push" });
    const effects = s.send({
      type: "context.navigated", id: "primary", url: "https://example.com/article", generation: 2, index: 1, size: 2,
      canGoBack: true, canGoForward: false, sameDocument: false, reload: false,
    });
    assert.ok(types(effects).includes("reveal"));
    assert.deepEqual(s.send({ type: "back" }), [{ type: "context.back", id: "primary" }]);
    const back = s.send({
      type: "context.navigated", id: "primary", url: `${HN}/`, generation: 3, index: 0, size: 2,
      canGoBack: false, canGoForward: true, sameDocument: false, reload: false,
    });
    assert.ok(types(back).includes("cover"));
    assert.equal(s.shown(), "custom");
  });

  test("8: an overlay survives save and restore, Back closes it", () => {
    const s = session();
    s.commit("primary", "/item?id=3");
    s.page("primary", "/item?id=3", "ready");
    s.send({ type: "navigate.screen", screen: { key: "saved-1", id: "saved", params: {} }, mode: "push" });
    const saved = JSON.parse(JSON.stringify(serialize(s.state)));

    const reopened = session(restore(saved, manifest));
    assert.equal(reopened.shown(), "overlay");
    assert.equal(reopened.context("primary").url, `${HN}/item?id=3`);
    assert.deepEqual(reopened.send({ type: "back" }), []);
    assert.equal(reopened.state.overlay.length, 0);
    assert.equal(reopened.state.active, "primary");
  });
});

describe("races and rules", () => {
  test("a stale deadline never flips a newer view", () => {
    const s = session();
    const [first] = s.commit("primary", "/item?id=1").filter(effect => effect.type === "schedule");
    const [second] = s.commit("primary", "/item?id=2").filter(effect => effect.type === "schedule");
    assert.notEqual(first.token, second.token);
    assert.deepEqual(s.send({ type: "deadline", id: "primary", token: first.token }), []);
    assert.equal(s.shown(), "custom");
    assert.deepEqual(s.send({ type: "deadline", id: "primary", token: second.token }), [{ type: "reveal", id: "primary" }]);
    assert.equal(s.shown(), "website");
    assert.deepEqual(s.page("primary", "/item?id=2", "ready"), [{ type: "cover" }], "a late ready page still wins");
  });

  test("a page before its navigation is applied, and the navigation joins it", () => {
    const s = session();
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    const early = s.send({
      type: "context.page", id: "primary", generation: 2, view: { generation: 2, n: 0, url: `${HN}/changepw` },
      status: "unsupported", pageId: null, routeId: null, account: null, stale: false,
    });
    assert.deepEqual(types(early), ["schedule", "reveal"]);
    const join = s.send({
      type: "context.navigated", id: "primary", url: `${HN}/changepw`, generation: 2, index: 1, size: 2,
      canGoBack: true, canGoForward: false, sameDocument: false, reload: false,
    });
    assert.deepEqual(join, [], "no second deadline and no second presentation change");
    assert.equal(s.context().index, 1);
  });

  test("pages from an older generation or an older view are dropped", () => {
    const s = session();
    s.commit("primary", "/");
    s.commit("primary", "/item?id=1");
    const older = s.send({
      type: "context.page", id: "primary", generation: 1, view: { generation: 1, n: 0, url: `${HN}/` },
      status: "ready", pageId: "feed", routeId: "home", account: null, stale: false,
    });
    assert.deepEqual(older, []);
    assert.equal(s.context().url, `${HN}/item?id=1`);

    s.send({
      type: "context.page", id: "primary", generation: 2, view: { generation: 2, n: 1, url: `${HN}/item?id=1#c` },
      status: "ready", pageId: "item", routeId: "item", account: null, stale: false,
    });
    const late = s.send({
      type: "context.page", id: "primary", generation: 2, view: { generation: 2, n: 0, url: `${HN}/item?id=1` },
      status: "ready", pageId: "item", routeId: "item", account: null, stale: false,
    });
    assert.deepEqual(late, []);
    assert.equal(s.context().url, `${HN}/item?id=1#c`);
  });

  test("an error with a stale page stays custom until the deadline", () => {
    const s = session();
    const [schedule] = s.commit("primary", "/item?id=1").filter(effect => effect.type === "schedule");
    s.page("primary", "/item?id=1", "error", { stale: true });
    assert.equal(s.shown(), "custom");
    s.send({ type: "deadline", id: "primary", token: schedule.token });
    assert.equal(s.shown(), "website");
  });

  test("the auth pin survives other pages until one is ready with an account", () => {
    const s = session();
    s.commit("primary", "/news?account=1");
    s.page("primary", "/news?account=1", "auth", { signInUrl: `${HN}/news?account=1` });
    assert.deepEqual(s.effects, [{ type: "reveal", id: "primary" }], "no navigation when already at the sign-in URL");
    s.commit("primary", "/");
    s.page("primary", "/", "ready");
    assert.equal(s.context().pin, "auth");
    s.page("primary", "/", "ready", { account: "someone" });
    assert.equal(s.context().pin, "none");
  });

  test("an overlay covers a revealed context and reveals it again when it closes", () => {
    const s = session();
    s.commit("primary", "/changepw");
    s.page("primary", "/changepw", "unsupported");
    assert.equal(revealed(s.state, manifest), "primary");
    assert.deepEqual(s.send({ type: "navigate.screen", screen: { key: "s", id: "saved", params: {} }, mode: "push" }), [{ type: "cover" }]);
    assert.deepEqual(s.send({ type: "back" }), [{ type: "reveal", id: "primary" }]);
  });

  test("Back order: leave guard, overlay, context history, leave", () => {
    const s = session();
    s.commit("primary", "/");
    s.commit("primary", "/item?id=1");
    s.send({ type: "navigate.screen", screen: { key: "s", id: "saved", params: {} }, mode: "push" });
    s.send({ type: "guard", guard: { message: "Discard the draft?" } });
    assert.deepEqual(s.send({ type: "back" }), [{ type: "confirmLeave", message: "Discard the draft?" }]);
    s.send({ type: "guard", guard: null });
    assert.deepEqual(s.send({ type: "back" }), []);
    assert.deepEqual(s.send({ type: "back" }), [{ type: "context.back", id: "primary" }]);
    s.commit("primary", "/", 0);
    assert.deepEqual(s.send({ type: "back" }), [{ type: "leave" }]);
  });

  test("selecting tabs switches contexts; reselecting returns to the start page", () => {
    const s = session();
    s.commit("primary", "/item?id=1");
    assert.deepEqual(s.send({ type: "select", id: "post" }), []);
    assert.equal(s.state.active, "post");
    s.send({ type: "select", id: "primary" });
    assert.deepEqual(s.send({ type: "select", id: "primary" }), [{ type: "context.navigate", id: "primary", url: `${HN}/`, mode: "push" }]);
    s.commit("primary", "/");
    assert.deepEqual(s.send({ type: "select", id: "primary" }), []);
  });

  test("restore ignores another session version and screens the manifest does not declare", () => {
    assert.deepEqual(restore({ version: 99, state: {} }, manifest), initialState(manifest));
    const state = restore({ version: 1, state: { active: "gone", overlay: [{ key: "x", id: "nope", params: {} }], contexts: {} } }, manifest);
    assert.equal(state.active, "primary");
    assert.deepEqual(state.overlay, []);
  });
});
