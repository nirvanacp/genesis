import { createRoot } from "react-dom/client";
import { definePage } from "@genesis/sdk";

export default definePage({
  activate({ root }) {
    const react = createRoot(root);
    react.render(<section><h1>Genesis Hacker News bookmarks</h1>
      <p>This packaged TypeScript/React page qualifies the local-page runtime without a development server.</p>
      <p>The native storage layer is available. Story controls, categories and the bookmark library are still being implemented.</p>
      <p>The planned library is local to Genesis and requires no Hacker News account.</p></section>);
    return () => react.unmount();
  },
});
