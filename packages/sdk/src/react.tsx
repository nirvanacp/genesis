import { useLayoutEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { AppletContext, Dispose } from "./runtime";

/** Resolve activation after React commits; always unmount if activation is retired. */
export function mountReact(context: AppletContext, container: HTMLElement, content: ReactNode): Promise<Dispose> {
  const root = createRoot(container);
  let disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; root.unmount(); } };
  context.onDispose(dispose);
  return new Promise(resolve => {
    function Committed() {
      useLayoutEffect(() => { resolve(dispose); }, []);
      return content;
    }
    root.render(<Committed />);
  });
}
