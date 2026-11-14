import { GenesisError, type Connection } from "../bridge.js";

/**
 * Gives the website `navigator.share` and `navigator.canShare` where the WebView has none, so a
 * site's own Share button opens Android's share sheet. Runs at document start on declared origins
 * only, with the agent's current connection. The host shares only while the user sees the website
 * and the page has user activation from their tap; text and links only, never files.
 */
export function installShare(connection: () => Connection | null): void {
  if (typeof navigator === "undefined" || "share" in navigator) return;

  const canShare = (data?: ShareData): boolean => {
    if (!data || (data.files && data.files.length > 0)) return false;
    if (data.title === undefined && data.text === undefined && data.url === undefined) return false;
    return data.url === undefined || webUrl(data.url) !== null;
  };

  const share = async (data?: ShareData): Promise<void> => {
    // Read before any await: activation is transient.
    const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive === true;
    if (!canShare(data)) throw new TypeError("Genesis shares a title, text or an http(s) link");
    const current = connection();
    if (!current || current.retired || !current.bound.limits.userActions) throw new DOMException("Sharing is not available", "NotAllowedError");
    const params: Record<string, unknown> = { active };
    if (data!.title !== undefined) params.title = String(data!.title);
    if (data!.text !== undefined) params.text = String(data!.text);
    if (data!.url !== undefined) params.url = webUrl(data!.url);
    try {
      await current.request("page.share", params);
    } catch (error) {
      const code = error instanceof GenesisError ? error.code : undefined;
      if (code === "INVALID_ARGUMENT") throw new TypeError(error instanceof Error ? error.message : "Invalid share data");
      if (code === "USER_ACTION_REQUIRED") throw new DOMException("Sharing needs a tap on the page", "NotAllowedError");
      throw new DOMException("Sharing was cancelled", "AbortError");
    }
  };

  for (const [name, value] of [["share", share], ["canShare", canShare]] as const) {
    Object.defineProperty(Navigator.prototype, name, { value, configurable: true, writable: true });
  }
}

/** `url` resolved against the page, when it is http or https; null otherwise. */
function webUrl(url: string): string | null {
  try {
    const resolved = new URL(String(url), location.href);
    return resolved.protocol === "https:" || resolved.protocol === "http:" ? resolved.href : null;
  } catch {
    return null;
  }
}
