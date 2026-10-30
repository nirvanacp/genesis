import { createRoot } from "react-dom/client";
import { definePage } from "@genesis/sdk";

export default definePage({
  activate({ root }) {
    const react = createRoot(root);
    react.render(<section><h1>Genesis local page</h1>
      <p>The packaged page and React entry loaded without a development server.</p>
      <p>Bookmark storage and library operations are not implemented in MVP-02.</p></section>);
    return () => react.unmount();
  },
});
