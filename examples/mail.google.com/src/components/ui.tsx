import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from "react";
import { useForeground, useNavigation } from "@genesis/sdk/react";
import type { ErrorInfo } from "@genesis/sdk";
import { avatarHue, initials } from "../model";

const ICONS = {
  menu: "M4 7h16M4 12h16M4 17h16",
  search: "M20 20l-4.6-4.6M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0",
  back: "M19 12H5M11 6l-6 6 6 6",
  close: "M6 6l12 12M18 6 6 18",
  archive: "M4 5h16v4H4zM5 9v10h14V9M10 13h4",
  trash: "M5 7h14M10 4h4M7 7l1 13h8l1-13M10 11v6M14 11v6",
  unread: "M3 6h18v12H3zM3 7l9 6 9-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  more: "M12 5.5h.01M12 12h.01M12 18.5h.01",
  plus: "M12 5v14M5 12h14",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  right: "M9 6l6 6-6 6",
  bell: "M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4",
  check: "M5 12.5 10 17 19 7",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z",
  clip: "M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4L15 7",
  reply: "M10 8V4L3 11l7 7v-4c5 0 8 1.5 11 5-1-6-4-10-11-11z",
  replyAll: "M13 8V4l-7 7 7 7v-4c4.5 0 7 1.5 9 5-1-6-3.5-10-9-11zM7 4l-7 7 7 7",
  forward: "M14 8V4l7 7-7 7v-4c-5 0-8 1.5-11 5 1-6 4-10 11-11z",
  inbox: "M4 13l2.5-8h11L20 13v6H4zM4 13h5l1 2h4l1-2h5",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  send: "M4 4l17 8-17 8 3-8zM7 12h14",
  draft: "M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  alert: "M12 3l10 18H2zM12 10v5M12 18h.01",
  important: "M4 6h11l5 6-5 6H4l4-6z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  pencil: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  todo: "M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M12 20h8M4 19.5h4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  repeat: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  note: "M5 4h14v16H5zM8 9h8M8 13h8M8 17h4",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  flag: "M5 21V4h11l-2 4 2 4H5",
  label: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  mute: "M11 5L6 9H3v6h3l5 4zM16 9l5 6M21 9l-5 6",
  spam: "M8 3h8l5 5v8l-5 5H8l-5-5V8zM12 8v5M12 16h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  swipe: "M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4",
  check2: "M4 4h16v16H4zM8 12l3 3 5-6",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, filled = false, size }: { name: IconName; filled?: boolean; size?: number }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "filled" : undefined} style={size ? { width: size, height: size } : undefined}>
    <path d={ICONS[name]} />
  </svg>;
}

export function IconButton({ icon, label, onClick, filled, disabled, pressed, className }: {
  icon: IconName; label: string; onClick?: () => void; filled?: boolean; disabled?: boolean; pressed?: boolean; className?: string;
}) {
  return <button type="button" className={`icon-button ${className ?? ""}`} aria-label={label} title={label} aria-pressed={pressed}
    disabled={disabled} onClick={onClick}>
    <Icon name={icon} filled={filled} />
  </button>;
}

/** A sender's initials in a soft circle whose color comes from the name. */
export function Avatar({ name, size = 40, selected = false }: { name: string; size?: number; selected?: boolean }) {
  const hue = avatarHue(name);
  if (selected) return <span className="avatar selected" style={{ width: size, height: size }} aria-hidden="true"><Icon name="check" /></span>;
  return <span className="avatar" aria-hidden="true"
    style={{ width: size, height: size, fontSize: size * 0.38, ["--hue" as string]: String(hue) }}>{initials(name)}</span>;
}

export function AccountDot({ color, label }: { color: string; label?: string }) {
  return <span className="account-dot" style={{ background: color }} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

export function Toggle({ label, detail, checked, onChange, icon }: { label: string; detail?: ReactNode; checked: boolean; onChange(value: boolean): void; icon?: ReactNode }) {
  const id = useId();
  return <label className="toggle-row" htmlFor={id}>
    {icon}
    <span className="toggle-text"><span>{label}</span>{detail && <small>{detail}</small>}</span>
    <input id={id} type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className="switch" aria-hidden="true" />
  </label>;
}

export function Chips<T extends string>({ label, options, value, onChange, className }: {
  label: string; options: { id: T; label: ReactNode; tone?: string }[]; value: T; onChange(value: T): void; className?: string;
}) {
  return <div className={`chips ${className ?? ""}`} role="radiogroup" aria-label={label}>
    {options.map(option => <button key={option.id} type="button" role="radio" aria-checked={option.id === value}
      className={`chip ${option.tone ?? ""}`} onClick={() => onChange(option.id)}>{option.label}</button>)}
  </div>;
}

/**
 * A bottom sheet over a dimmed backdrop. The app keeps the screen it opened from rendered
 * underneath, so the person keeps their place. Tapping the backdrop, Close, or dragging the
 * sheet down by its handle or header closes it; a short drag springs back.
 */
export function Sheet({ title, icon, tone, children, footer, onClose, labelledBy }: {
  title: string; icon: IconName; tone: "reminder" | "todo" | "neutral"; children: ReactNode; footer?: ReactNode;
  onClose(): void; labelledBy?: string;
}) {
  const heading = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; dy: number } | null>(null);
  // Focus moves into the sheet and returns to the control that opened it when the sheet closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.current?.focus();
    return () => { if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);

  const move = (y: number) => {
    const state = drag.current;
    if (!state || !sheet.current) return;
    state.dy = Math.max(0, y - state.y);
    sheet.current.style.transform = state.dy ? `translateY(${state.dy}px)` : "";
  };
  const end = () => {
    const state = drag.current;
    drag.current = null;
    if (!state || !sheet.current) return;
    sheet.current.classList.remove("dragging");
    if (state.dy > Math.min(120, sheet.current.offsetHeight / 4)) { onClose(); return; }
    sheet.current.style.transform = "";
  };
  const handle = {
    onPointerDown: (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest("button")) return;
      drag.current = { id: event.pointerId, y: event.clientY, dy: 0 };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      sheet.current?.classList.add("dragging");
    },
    onPointerMove: (event: PointerEvent) => { if (drag.current?.id === event.pointerId) move(event.clientY); },
    onPointerUp: end,
    onPointerCancel: end,
  };

  return <div className="sheet-layer">
    <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? heading} ref={sheet} tabIndex={-1}>
      <div className="sheet-handle" {...handle}>
        <span className="grabber" aria-hidden="true" />
        <header className="sheet-head">
          <span className={`tile ${tone}`}><Icon name={icon} /></span>
          <h2 id={heading}>{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </header>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </div>
  </div>;
}

/**
 * A menu anchored by its class, over a clear scrim that closes it. It grows from its corner,
 * focuses its first item, and closes with Escape.
 */
/** How many menus are open. The shell drops a menu screen left on top when none is. */
export const openMenus = { count: 0 };

/**
 * A menu over the screen. It opens a `menu` screen of its own, so Back closes the menu first;
 * closing the menu any other way takes that screen away again.
 */
export function Popover({ children, onClose, className }: { children: ReactNode; onClose(): void; className: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const navigation = useForeground().navigation;
  const { screen } = useNavigation();
  const menu = useRef<{ key: string | null; seen: boolean }>({ key: null, seen: false });
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    openMenus.count++;
    navigation.navigate({ screen: "menu" });
    menu.current = { key: navigation.screen()?.key ?? null, seen: false };
    return () => {
      openMenus.count--;
      if (menu.current.key && navigation.screen()?.key === menu.current.key) navigation.back();
      menu.current = { key: null, seen: false };
    };
  }, [navigation]);
  // Back, or a link from the menu, made another screen current: the menu has closed.
  useEffect(() => {
    const state = menu.current;
    if (!state.key) return;
    if (screen?.key === state.key) state.seen = true;
    else if (state.seen) { menu.current = { key: null, seen: false }; close.current(); }
  }, [screen?.key]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return <>
    <button type="button" className="popover-scrim" aria-label="Close menu" onClick={onClose} />
    <div ref={ref} role="menu" className={`popover ${className}`}>{children}</div>
  </>;
}

export function TopBar({ title, children, onBack, backLabel = "Back", className }: {
  title?: ReactNode; children?: ReactNode; onBack?: () => void; backLabel?: string; className?: string;
}) {
  const { back } = useNavigation();
  return <header className={`top-bar ${className ?? ""}`}>
    <IconButton icon="back" label={backLabel} onClick={onBack ?? back} />
    {title !== undefined && <h1>{title}</h1>}
    <span className="spacer" />
    {children}
  </header>;
}

/**
 * A placeholder shaped like what is loading. It fades in only if loading takes longer than a
 * moment, so fast loads never flash, and its bars shimmer (they hold still with reduced motion).
 */
export function Skeleton({ label, rows = 7, kind = "rows" }: { label: string; rows?: number; kind?: "rows" | "text" | "email" }) {
  if (kind === "email") return <div role="status" aria-busy="true" aria-label={label} className="skeleton email">
    <span className="bar title" /><span className="bar title short" />
    <div className="skeleton-row" aria-hidden="true"><span className="skeleton-avatar" /><div><span /><span /></div></div>
    {Array.from({ length: rows }, (_, index) => <span key={index} className={`bar line ${index % 4 === 3 ? "short" : ""}`} aria-hidden="true" />)}
  </div>;
  return <div role="status" aria-busy="true" aria-label={label} className={`skeleton ${kind}`}>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="skeleton-row" aria-hidden="true">
      {kind === "rows" && <span className="skeleton-avatar" />}
      <div><span /><span /><span /></div>
    </div>)}
  </div>;
}

/** A thin bar under the header while something the screen already shows is being refreshed or run. */
export function ProgressBar({ active, label = "Loading" }: { active: boolean; label?: string }) {
  return <div className={`progress-bar${active ? " active" : ""}`} role="progressbar" aria-label={label} aria-hidden={!active} aria-busy={active} />;
}

/** True once a loading state has been shown, so content that replaces it can fade in. */
export function useSawLoading(loading: boolean): boolean {
  const saw = useRef(loading);
  if (loading) saw.current = true;
  return saw.current;
}

export function Notice({ title, children, role, icon }: { title: string; children?: ReactNode; role?: "alert" | "status"; icon?: IconName }) {
  return <section className="notice" role={role}>
    {icon && <span className="notice-icon"><Icon name={icon} size={28} /></span>}
    <h2>{title}</h2>
    {children}
  </section>;
}

export function LoadError({ error }: { error: ErrorInfo | null }) {
  const { reload, viewWebsite } = useNavigation();
  const message = error?.code === "NOT_READY" || error?.code === "DEADLINE" ? "Gmail did not answer in time."
    : error?.message || "This page could not be read.";
  return <Notice title="Couldn't load Gmail" role="alert" icon="alert">
    <p>{message}</p>
    <div className="row-buttons">
      <button type="button" className="secondary" onClick={() => reload()}>Try again</button>
      <button type="button" className="secondary" onClick={() => viewWebsite()}>Open in Gmail <Icon name="external" /></button>
    </div>
  </Notice>;
}

/** Text that may be long, with the matching search terms highlighted. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.map(term => term.trim()).filter(term => term.length > 1);
  if (!words.length) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(pattern).map((part, index) => index % 2 === 1 ? <mark key={index}>{part}</mark> : part)}</>;
}

/** The product mark from the mockups: "gmail" with "only" in blue. */
export function Logo() {
  return <span className="logo" aria-label="Gmail Only">gmail <span>only</span></span>;
}
