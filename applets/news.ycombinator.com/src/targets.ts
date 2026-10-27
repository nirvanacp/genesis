// Observed in public HTML on 2026-10-27. Android isolated-world qualification is pending.
// Comment rows also use .athing; only submission rows may become story Save targets.
const selectors = ["#hnmain", "tr.athing.submission[id]", "tr.athing.submission .titleline > a:first-child", ".subtext", "tr.comtr"];

export function inspectTargets() {
  return {
    locale: document.documentElement.lang,
    targets: selectors.map(selector => {
      const elements = document.querySelectorAll(selector);
      const first = elements[0];
      // Structural evidence only. Never include page text, input values or browser credentials.
      return { selector, count: elements.length,
        sample: first ? { tag: first.tagName, classes: first.className.toString().slice(0, 256),
          children: Array.from(first.children).slice(0, 8).map(child => child.tagName) } : null };
    }),
  };
}
