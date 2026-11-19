// The Genesis bridge for a website document in GeckoView. It runs in the content-script world of
// every top-level http(s) document, at document start, and connects a native port to the shell.
// The shell answers with `start` only on the context's declared origins; only then does the page
// agent (`page.js`) run, here, with `window.__genesisBridge` as WebView gives it. Website scripts
// never see the bridge or the agent, which live in this world.
(() => {
  if (window.top !== window) return;
  const port = browser.runtime.connectNative("genesis");
  const listeners = [];
  let started = false;

  // The agent patches History.prototype in this world. Website calls go through the page world's
  // prototype, so its pushState and replaceState forward to this world's, where the agent sees them.
  // This must happen now, before website scripts take references to the originals.
  const page = window.wrappedJSObject;
  for (const name of ["pushState", "replaceState"]) {
    page.History.prototype[name] = exportFunction(function (...args) { return history[name](...args); }, page);
  }

  port.onMessage.addListener(message => {
    switch (message.type) {
      case "start":
        if (started) return;
        started = true;
        window.__genesisBridge = {
          postMessage(text) { port.postMessage({ type: "message", data: String(text) }); },
          addEventListener(type, listener) { if (type === "message") listeners.push(listener); },
        };
        // page.js is the applet's built agent; the shell sends it only for the declared origins.
        (0, eval)(message.code);
        return;
      case "message":
        for (const listener of [...listeners]) listener({ data: message.data });
        return;
      case "followLink":
        port.postMessage({ type: "followed", id: message.id, taken: followLink(message.url) });
        return;
      case "route":
        port.postMessage({ type: "followed", id: message.id, taken: route(message.url, message.replace === true, message.windowMs) });
        return;
    }
  });

  // The same step as the shell's ROUTE script for WebView: moves the history entry to the URL and
  // tells the website's router with a popstate, then loads the URL over that entry when nothing in
  // the page changed within windowMs. False when it did not move the entry.
  function route(target, replace, windowMs) {
    try {
      const url = new URL(target);
      const here = new URL(location.href);
      if (url.origin !== here.origin || !document.body) return false;
      if (url.pathname === here.pathname && url.search === here.search) return false;
      const title = document.title;
      let changed = false;
      const hasElement = nodes => Array.prototype.some.call(nodes, node => node.nodeType === 1);
      const observer = new MutationObserver(records => {
        if (records.some(record => hasElement(record.addedNodes) || hasElement(record.removedNodes))) changed = true;
      });
      // The state stays the page world's own value, so the website's popstate handler can read it.
      const state = page.history.state;
      const init = new page.Object();
      init.state = state;
      const popstate = new page.PopStateEvent("popstate", init);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      try {
        if (replace) history.replaceState(state, "", url.href);
        else history.pushState(state, "", url.href);
      } catch (error) {
        observer.disconnect();
        return false;
      }
      setTimeout(() => {
        observer.disconnect();
        if (changed || document.title !== title) return;
        if (location.href === url.href) location.replace(url.href);
      }, windowMs);
      page.dispatchEvent(popstate);
      return true;
    } catch (error) {
      return false;
    }
  }

  // The same step as the shell's FOLLOW_LINK script for WebView: offers a navigation to the page as
  // a click on its own link to the URL. True when the page's script took the click.
  function followLink(target) {
    try {
      const url = new URL(target);
      if (url.origin !== location.origin) return false;
      const link = Array.prototype.find.call(document.querySelectorAll("a[href]"), a =>
        a.href === url.href && (!a.target || a.target === "_self") && !a.hasAttribute("download"));
      if (!link) return false;
      let taken = false;
      let reached = false;
      const last = event => {
        reached = true;
        taken = event.defaultPrevented;
        if (!taken) event.preventDefault();
      };
      window.addEventListener("click", last);
      try {
        link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, button: 0 }));
      } finally {
        window.removeEventListener("click", last);
      }
      return !reached || taken;
    } catch (error) {
      return false;
    }
  }

  // A tapped link that opens a new window goes to the shell instead, which decides where it opens,
  // as WebView's hit test does. Only the user's own click, after the website's handlers let it go.
  window.addEventListener("click", event => {
    if (event.defaultPrevented || !event.isTrusted || event.button !== 0) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href], area[href]") : null;
    if (!link || link.hasAttribute("download") || typeof link.href !== "string") return;
    const base = document.querySelector("base[target]");
    const target = (link.getAttribute("target") ?? (base ? base.getAttribute("target") : "") ?? "").toLowerCase();
    if (!opensWindow(target)) return;
    let url;
    try { url = new URL(link.href); } catch (error) { return; }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    event.preventDefault();
    port.postMessage({ type: "windowLink", url: url.href });
  });

  // A target names a new window unless it is this window, its parent or top, or one of its frames.
  function opensWindow(target) {
    if (!target || target === "_self" || target === "_parent" || target === "_top") return false;
    if (target === "_blank") return true;
    for (let i = 0; i < window.frames.length; i++) {
      try { if (window.frames[i].name === target) return false; } catch (error) { /* Another origin's frame. */ }
    }
    return true;
  }

  port.postMessage({ type: "hello" });
})();
