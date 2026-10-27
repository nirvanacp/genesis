import { createRoot } from "react-dom/client";

// Packaged for build verification only. The host does not expose local pages yet.
const mount = () => {
  const container = document.createElement("main");
  document.body.append(container);
  createRoot(container).render(<p>Genesis MVP-01. Bookmark library is not implemented.</p>);
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
