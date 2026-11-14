// Document-start stub. Runs in the content-script world before any website script.
(() => {
  if (window.top !== window) return;
  const port = browser.runtime.connectNative("genesis");
  const listeners = [];
  const queue = [];
  // Page-world history hook, installed synchronously: forwards the website's calls to the
  // content-script history methods, where the page agent patches them.
  const page = window.wrappedJSObject;
  for (const name of ["pushState", "replaceState"]) {
    const native = page.History.prototype[name];
    page.History.prototype[name] = exportFunction(function (...args) {
      return history[name](...args);
    }, page);
  }
  window.__genesisBridge = {
    postMessage(text) { port.postMessage({ type: "message", data: String(text) }); },
    addEventListener(type, listener) { if (type === "message") listeners.push(listener); },
  };
  port.onMessage.addListener(message => {
    if (message.type === "start") {
      const started = performance.now();
      try {
        (0, eval)(message.code);
        port.postMessage({ type: "log", data: "eval ok in " + Math.round(performance.now() - started) + "ms" });
      } catch (error) {
        port.postMessage({ type: "log", data: "eval failed: " + error });
        browser.runtime.sendMessage({ run: message.code });
      }
      return;
    }
    if (message.type === "message") for (const listener of [...listeners]) listener({ data: message.data });
    if (message.type === "pageEval") {
      try { page.eval(message.code); port.postMessage({ type: "log", data: "page eval ok" }); }
      catch (error) { port.postMessage({ type: "log", data: "page eval failed: " + error }); }
    }
  });
  port.postMessage({ type: "hello", url: location.href, readyState: document.readyState, scripts: document.scripts.length });
})();
