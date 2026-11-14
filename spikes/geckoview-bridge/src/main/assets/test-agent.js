// Stands in for page.js: the same capture-and-delete and history patch the SDK agent does.
(() => {
  const scope = window;
  const bridge = scope.__genesisBridge;
  try { delete scope.__genesisBridge; } catch { scope.__genesisBridge = undefined; }
  if (!bridge) return;
  const send = text => bridge.postMessage(text);
  for (const name of ["pushState", "replaceState"]) {
    const original = History.prototype[name];
    History.prototype[name] = function (...args) {
      const result = original.apply(this, args);
      send("onUrl " + name + " " + location.href);
      return result;
    };
  }
  bridge.addEventListener("message", event => send("echo " + event.data));
  document.addEventListener("click", event => {
    send("click trusted=" + event.isTrusted + " activation=" + navigator.userActivation.isActive);
  }, true);
  document.addEventListener("keydown", event => send("key " + event.key + " trusted=" + event.isTrusted), true);
  const pageSees = typeof window.wrappedJSObject.__genesisBridge;
  send("agent APPLET url=" + location.href + " readyState=" + document.readyState + " pageSeesBridge=" + pageSees +
    " stillHere=" + typeof scope.__genesisBridge + " title=" + document.title);
})();
