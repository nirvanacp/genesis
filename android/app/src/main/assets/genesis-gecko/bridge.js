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
    }
  });

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

  port.postMessage({ type: "hello" });
})();
