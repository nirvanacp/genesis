// Own only Genesis nodes. The source document and its existing application root stay intact.
export class PageScope {
  private readonly style = document.createElement("style");
  private readonly host = document.createElement("div");
  private readonly container = document.createElement("div");

  constructor(css: string) {
    if (!document.body) throw new Error("Document body is not ready");
    if (document.querySelector("[data-genesis-owned='qualification']")) throw new Error("Duplicate qualification host");
    this.style.dataset.genesisStyle = "qualification";
    this.style.textContent = css;
    this.host.dataset.genesisOwned = "qualification";
    this.host.attachShadow({ mode: "open" }).append(this.container);
    try {
      document.body.append(this.style, this.host);
      if (getComputedStyle(this.host).getPropertyValue("--genesis-qualified").trim() !== "ready") {
        throw new Error("Managed CSS did not apply under the current realm policy");
      }
    } catch (error) { this.dispose(); throw error; }
  }
  root(): HTMLElement { return this.container; }
  dispose(): void { this.host.remove(); this.style.remove(); }
  free(): void { this.dispose(); }
}
