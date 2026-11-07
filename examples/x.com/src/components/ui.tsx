import type { ReactNode } from "react";
import { useNavigation } from "@genesis/sdk/react";
import type { ErrorInfo } from "@genesis/sdk";
import { ORIGIN, type TextPart } from "../model";

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "M21 21l-5.2-5.2M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  reply: "M4 5h16v11H9l-5 4z",
  repost: "M7 4 3 8l4 4M3 8h13a4 4 0 0 1 4 4M17 20l4-4-4-4M21 16H8a4 4 0 0 1-4-4",
  heart: "M12 20s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.1-8 11-8 11z",
  views: "M5 20V12M10 20V6M15 20v-9M20 20V4",
  folder: "M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  close: "M6 6l12 12M18 6 6 18",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  check: "M5 12.5 10 17 19 7",
};
export type IconName = keyof typeof ICONS;

export function Icon({ name, filled = false }: { name: IconName; filled?: boolean }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "filled" : undefined}><path d={ICONS[name]} /></svg>;
}

/** Website links go through the manifest, which picks a screen or the website sheet. */
export function useOpenRoute() {
  const { navigate } = useNavigation();
  return (url: string) => void navigate({ kind: "route", url });
}

/** Post text with its links, mentions and hashtags. Text is never parsed as HTML. */
export function RichText({ parts, className }: { parts: TextPart[]; className?: string }) {
  const open = useOpenRoute();
  return <p className={className ?? "post-text"} dir="auto">{parts.map((part, index) => part.href
    ? <a key={index} href={part.href} onClick={event => { event.preventDefault(); event.stopPropagation(); open(part.href!); }}>{part.text}</a>
    : <span key={index}>{part.text}</span>)}</p>;
}

export function Avatar({ src, size = 40 }: { src: string | null; size?: number }) {
  return src
    ? <img className="avatar" src={src} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" />
    : <span className="avatar" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Verified() {
  return <svg viewBox="0 0 24 24" className="verified" role="img" aria-label="Verified account">
    <path d="M12 2.5l2.4 1.8 3-.2.9 2.8 2.5 1.7-1 2.9 1 2.9-2.5 1.7-.9 2.8-3-.2L12 21.5l-2.4-1.8-3 .2-.9-2.8-2.5-1.7 1-2.9-1-2.9 2.5-1.7.9-2.8 3 .2z" />
    <path d="M8 12.2l2.6 2.6L16 9.4" className="tick" />
  </svg>;
}

export function Skeleton({ label, rows = 6, kind = "posts" }: { label: string; rows?: number; kind?: "posts" | "text" }) {
  return <div role="status" aria-busy="true" aria-label={label} className={`skeleton ${kind}`}>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-row" aria-hidden="true">
      {kind === "posts" && <span className="skeleton-avatar" />}
      <div><span /><span /><span /></div>
    </div>)}
  </div>;
}

/** Error and empty states share this layout; the text says which it is. */
export function Notice({ title, children, role }: { title: string; children?: ReactNode; role?: "alert" | "status" }) {
  return <section className="notice" role={role}><h2>{title}</h2>{children}</section>;
}

export function OpenOnX({ url, label = "Open on X" }: { url: string; label?: string }) {
  const { navigate } = useNavigation();
  return <button type="button" className="secondary" onClick={() => void navigate({ kind: "website", url })}>
    {label} <Icon name="external" />
  </button>;
}

export function LoadError({ error, url }: { error: ErrorInfo | null; url: string | null }) {
  const message = error?.code === "NOT_READY" ? "X did not answer in time."
    : error?.code === "SNAPSHOT_TOO_LARGE" ? "This page has more than the app can show at once."
    : error?.message || "This page could not be read.";
  return <Notice title="Couldn't load this page" role="alert">
    <p>{message}</p>
    {url && <OpenOnX url={url} />}
  </Notice>;
}

/** Sign-in happens on X's own page in the website sheet. */
export function SignInPrompt({ reason }: { reason: string }) {
  const { navigate } = useNavigation();
  return <Notice title="Sign in to X">
    <p>{reason}</p>
    <button type="button" className="primary" onClick={() => void navigate({ kind: "website", url: `${ORIGIN}/i/flow/login` })}>
      Sign in <Icon name="external" />
    </button>
  </Notice>;
}

/** A segmented row of tabs. Each choice is a URL or a screen, so the manifest still decides where it goes. */
export function ModeTabs({ label, options, active }: { label: string; options: { id: string; label: string; go(): void }[]; active: string }) {
  return <nav className="mode-tabs" aria-label={label}>
    {options.map(option => <button type="button" key={option.id} className="mode-tab" aria-current={option.id === active ? "page" : undefined}
      onClick={() => option.id !== active && option.go()}>{option.label}</button>)}
  </nav>;
}
