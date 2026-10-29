/** Nested controls and selected text keep their native semantics, including Shadow DOM controls. */
export function tileClick(event: MouseEvent, navigate: () => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || window.getSelection()?.toString()) return;
  if (event.composedPath().some(node => node instanceof Element && node.matches("a,button,input,textarea,select,summary,[role=button],[contenteditable=true]"))) return;
  navigate();
}
export function bindDiscussionTile(element: Element, destination: () => string | null): () => void {
  const click = (event: Event) => tileClick(event as MouseEvent, () => { const url = destination(); if (url) location.assign(url); });
  element.addEventListener("click", click);
  element.classList.add("discussion-tile");
  return () => { element.removeEventListener("click", click); element.classList.remove("discussion-tile"); };
}
