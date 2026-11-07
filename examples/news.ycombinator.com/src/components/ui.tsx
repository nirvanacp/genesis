import type { ReactNode } from "react";
import { useNavigation } from "@genesis/sdk/react";
import type { ErrorInfo } from "@genesis/sdk";
import { ORIGIN, type TextPart } from "../model";

const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  search: "M21 21l-5.2-5.2M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  post: "M12 5v14M5 12h14",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  up: "M12 6l7 10H5z",
  chevron: "M9 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, filled = false }: { name: IconName; filled?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "filled" : undefined}><path d={ICONS[name]} /></svg>;
}

/** Website links go through the manifest, which picks a screen or the website sheet. */
export function useOpenRoute() {
  const { navigate } = useNavigation();
  return (url: string) => {
    navigate({ kind: "route", url }).catch(error => console.error("Genesis could not open", url, error));
  };
}

/** HN's formatted text. Links open through the manifest; text is never parsed as HTML. */
export function RichText({ parts, onLink }: { parts: TextPart[]; onLink?: (url: string) => void }) {
  const open = useOpenRoute();
  const follow = onLink ?? open;
  return <div className="rich">{parts.map((part, index) => {
    let node: ReactNode = part.text;
    if (part.code) node = <code>{node}</code>;
    if (part.em) node = <em>{node}</em>;
    if (part.strong) node = <strong>{node}</strong>;
    if (part.href) {
      const href = part.href;
      node = <a href={href} onClick={event => { event.preventDefault(); follow(href); }}>{node}</a>;
    }
    return <span key={index}>{node}</span>;
  })}</div>;
}

export function Skeleton({ label, rows = 8, kind = "list" }: { label: string; rows?: number; kind?: "list" | "text" }) {
  return <div role="status" aria-busy="true" aria-label={label} className={`skeleton ${kind}`}>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-row" aria-hidden="true">
      <span /><span />
    </div>)}
  </div>;
}

/** Error and empty states share this layout; the text says which it is. */
export function Notice({ title, children, role }: { title: string; children?: ReactNode; role?: "alert" | "status" }) {
  return <section className="notice" role={role}><h2>{title}</h2>{children}</section>;
}

export function LoadError({ error, url }: { error: ErrorInfo | null; url: string | null }) {
  const { navigate } = useNavigation();
  const message = error?.code === "NOT_READY"
    ? "Hacker News did not answer in time."
    : error?.message || "This page could not be read.";
  return <Notice title="Couldn't load this page" role="alert">
    <p>{message}</p>
    {url && <button type="button" className="secondary" onClick={() => void navigate({ kind: "website", url })}>
      Open on Hacker News <Icon name="external" />
    </button>}
  </Notice>;
}

/** Shown when HN asks for an account; sign-in happens on HN's own page in the website sheet. */
export function SignInPrompt({ reason, goto }: { reason: string; goto: string }) {
  const { navigate } = useNavigation();
  return <Notice title="Sign in to Hacker News">
    <p>{reason}</p>
    <button type="button" className="primary" onClick={() =>
      void navigate({ kind: "website", url: `${ORIGIN}/login?goto=${encodeURIComponent(goto)}` })}>
      Sign in <Icon name="external" />
    </button>
  </Notice>;
}

/** "3 hours ago" style metadata joined with separators, skipping unknown parts. */
export function Meta({ parts }: { parts: (ReactNode | null | false)[] }) {
  const shown = parts.filter(Boolean);
  return <p className="meta">{shown.map((part, index) => <span key={index}>{index > 0 && " · "}{part}</span>)}</p>;
}
