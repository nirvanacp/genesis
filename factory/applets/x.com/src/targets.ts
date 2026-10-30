// Candidate selectors for live qualification only. No feature classifier is public yet.
const selectors = ["#react-root", "article[data-testid=\"tweet\"]", "[data-testid=\"tweetText\"]", "video"];
export function inspectTargets() {
  return {
    locale: document.documentElement.lang,
    targets: selectors.map(selector => {
      const elements = document.querySelectorAll(selector);
      const first = elements[0];
      // Record structural evidence only, never text, input values, cookies or tokens.
      return { selector, count: elements.length,
        sample: first ? { tag: first.tagName, classes: first.className.toString().slice(0, 256),
          children: Array.from(first.children).slice(0, 8).map(child => child.tagName) } : null };
    }),
  };
}
