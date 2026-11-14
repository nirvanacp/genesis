browser.runtime.onMessage.addListener((message, sender) => {
  if (message.run && sender.tab) {
    return browser.tabs.executeScript(sender.tab.id, { code: message.run, frameId: 0, runAt: "document_start" })
      .then(() => browser.runtime.sendNativeMessage("genesis", { type: "log", data: "executeScript ok" }))
      .catch(error => browser.runtime.sendNativeMessage("genesis", { type: "log", data: "executeScript failed: " + error }));
  }
});
