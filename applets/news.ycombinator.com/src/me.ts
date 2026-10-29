import type { AppletContext } from "@genesis/sdk";
import theme from "./theme.css";

const origin = "https://news.ycombinator.com";
export function mountAccountHub(context: AppletContext): void {
  document.documentElement.classList.add("genesis-account-hub");
  context.onDispose(() => document.documentElement.classList.remove("genesis-account-hub"));
  const profile = document.querySelector<HTMLAnchorElement>(".pagetop a[href^='user?id=']");
  const username = profile?.textContent?.trim() || "";
  const logout = [...document.querySelectorAll<HTMLAnchorElement>(".pagetop a")]
    .find(link => link.textContent?.trim() === "logout");
  context.ui.mountAt("account-hub", document.body, { position: "append", css: theme + `
    :host{display:block;background:var(--paper);color:var(--ink);min-height:calc(100vh - 92px);padding:22px 18px 92px;font:15px/1.5 Verdana,Geneva,sans-serif}.hub{max-width:760px;margin:auto}h1{font-size:25px;margin:0 0 5px}p{color:var(--muted);margin:0 0 24px}.links{display:grid;gap:9px}a{display:flex;align-items:center;min-height:52px;padding:12px 15px;border:1px solid var(--line);border-radius:13px;background:var(--card);color:var(--ink);text-decoration:none;font-weight:600}a:focus-visible{outline:3px solid var(--accent)}.identity{background:var(--wash);padding:16px;border-radius:14px;margin:16px 0 22px}.identity strong{display:block;font-size:18px}.small{font-size:13px;margin-top:20px}`,
    render(container) {
      const hub = document.createElement("main"); hub.className = "hub";
      const heading = document.createElement("h1"); heading.textContent = "Me"; hub.append(heading);
      const intro = document.createElement("p"); intro.textContent = "Your Hacker News account"; hub.append(intro);
      if (username) {
        const identity = document.createElement("div"); identity.className = "identity";
        const name = document.createElement("strong"); name.textContent = username;
        identity.append(name, "Signed in to Hacker News"); hub.append(identity);
      }
      const links = document.createElement("div"); links.className = "links";
      const add = (label: string, href: string) => {
        const link = document.createElement("a"); link.textContent = label; link.href = href; links.append(link);
      };
      if (username) {
        const id = encodeURIComponent(username);
        add("Profile and settings", `${origin}/user?id=${id}`);
        add("My submissions", `${origin}/submitted?id=${id}`);
        add("My comments", `${origin}/threads?id=${id}`);
        add("HN favorites", `${origin}/favorites?id=${id}`);
        if (logout?.href) add("Sign out", logout.href);
      } else {
        add("Sign in", `${origin}/login?goto=news`);
        add("Forgot password", `${origin}/forgot`);
      }
      hub.append(links);
      const note = document.createElement("p"); note.className = "small";
      note.textContent = "Genesis Saved stories are separate from Hacker News favorites.";
      hub.append(note); container.append(hub);
    },
  });
}
