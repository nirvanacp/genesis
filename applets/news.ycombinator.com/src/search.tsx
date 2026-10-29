import { useState } from "react";
import { createRoot } from "react-dom/client";
import { definePage, type AppletContext } from "@genesis/sdk";
import { Navigation } from "./components/navigation";
import theme from "./theme.css";
import libraryCss from "./library.css";

export default definePage({
  mount(context, container) {
    const root = createRoot(container);
    root.render(<SearchPage context={context} />);
    return () => root.unmount();
  },
});

function SearchPage({ context }: { context: AppletContext }) {
  const [error, setError] = useState("");
  return <><style>{theme}{libraryCss}{`
    :host{display:block;background:var(--paper);min-height:100vh;color:var(--ink);font:15px/1.5 Verdana,Geneva,sans-serif}
    .search-page{max-width:760px;margin:auto;padding:24px 18px 100px}
    .search-page h1{font:700 1.6rem Verdana,Geneva,sans-serif;letter-spacing:0;margin:0 0 28px}
    .placeholder{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:26px 20px}
    .placeholder h2{font-size:1.1rem;margin:0 0 8px}.placeholder p{color:var(--muted);margin:0}
  `}</style><main className="search-page"><h1>Search</h1><section className="placeholder">
    <h2>Search is coming</h2><p>This space will connect to a separate search site. For now, browse Home or your Saved stories.</p>
  </section>{error && <p role="alert">{error}</p>}</main><Navigation context={context} current="search" error={setError} /></>;
}
