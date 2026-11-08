import { useRef, type ComponentType } from "react";
import { useAppResume, useNavigation } from "@genesis/sdk/react";
import { ORIGIN } from "./model";
import { Icon, type IconName } from "./components/ui";
import { AccountScreen } from "./screens/account";
import { CategoriesScreen } from "./screens/categories";
import { ExploreScreen } from "./screens/explore";
import { FeedScreen } from "./screens/feed";
import { ManageScreen } from "./screens/manage";
import { MediaScreen } from "./screens/media";
import { PostScreen } from "./screens/post";
import { ProfileScreen } from "./screens/profile";
import { SaveScreen } from "./screens/save";

const SCREENS: Record<string, ComponentType> = {
  home: FeedScreen, notifications: FeedScreen, saved: FeedScreen, explore: ExploreScreen, post: PostScreen,
  profile: ProfileScreen, media: MediaScreen, account: AccountScreen, categories: CategoriesScreen,
  save: SaveScreen, manage: ManageScreen,
};

type TabId = "home" | "explore" | "notifications" | "saved" | "profile";

/**
 * The tabs. Explore and Profile are contexts of their own. Home, Notifications and Saved share the
 * primary context, so Notifications and Saved load their X page in it; the start page of the
 * primary context is Home.
 */
const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "explore", label: "Explore", icon: "search" },
  { id: "notifications", label: "Notifications", icon: "bell" },
  { id: "saved", label: "Saved", icon: "bookmark" },
  { id: "profile", label: "Profile", icon: "person" },
];

const PATHS: Record<string, string> = { home: "/home", notifications: "/notifications", saved: "/i/history" };

/** The primary tab whose X page this is, or null for a page opened from one, such as a post. */
function primaryTab(url: string | null): TabId | null {
  const path = url ? new URL(url).pathname : "/home";
  if (path === "/home") return "home";
  if (path === "/notifications") return "notifications";
  if (path.startsWith("/i/history") || path === "/i/bookmarks") return "saved";
  return null;
}

export function App() {
  const { screen, active, contexts, overlay, select, navigate, reload } = useNavigation();
  // The website sheet or time away may have changed the signed-in account. Until the account page
  // loads again, `useAccount` has no account, so Saved categories wait instead of using the old one.
  useAppResume(() => reload("account"));
  // A post opened from Saved keeps Saved current, so the primary context remembers its last tab.
  const lastPrimary = useRef<TabId>("home");
  const primary = primaryTab(contexts.primary?.url ?? null);
  if (primary) lastPrimary.current = primary;
  const current: TabId = overlay.length > 0 ? "saved"
    : active === "explore" ? "explore" : active === "account" ? "profile" : primary ?? lastPrimary.current;

  // A primary tab returns to the primary context as it was when it is that context's current tab,
  // and otherwise loads its own X page there.
  const choose = (tab: TabId) => {
    if (tab === "explore") select("explore");
    else if (tab === "profile") select("account");
    else if (tab === lastPrimary.current && (active !== "primary" || overlay.length > 0 || tab === "home")) select("primary");
    else navigate({ url: `${ORIGIN}${PATHS[tab]}`, context: "primary" });
  };

  const Screen = screen ? SCREENS[screen.id] : undefined;
  return <div className={screen?.id === "media" ? "app viewing" : "app"}>
    <main className="content">{Screen && <Screen key={screen!.key} />}</main>
    <nav className="tabs" aria-label="Sections">
      {TABS.map(tab => {
        const here = tab.id === current;
        return <button type="button" key={tab.id} className="tab" aria-current={here ? "page" : undefined} onClick={() => {
          // Reselecting Notifications or Saved on its own page scrolls to the top; Home's start page does that on select.
          if (here && overlay.length === 0 && primary === tab.id && tab.id !== "home") {
            document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" });
          } else choose(tab.id);
        }}>
          <Icon name={tab.icon} filled={here} />
          <span>{tab.label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
