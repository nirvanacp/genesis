import type { ComponentType } from "react";
import { useNavigation } from "@genesis/sdk/react";
import type { NavigateTarget } from "@genesis/sdk";
import { useAccount } from "./library";
import { ORIGIN, profileUrl } from "./model";
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
import { UnsupportedScreen } from "./screens/unsupported";

const SCREENS: Record<string, ComponentType> = {
  home: FeedScreen, notifications: FeedScreen, saved: FeedScreen, explore: ExploreScreen, post: PostScreen,
  profile: ProfileScreen, media: MediaScreen, account: AccountScreen, categories: CategoriesScreen,
  save: SaveScreen, manage: ManageScreen, unsupported: UnsupportedScreen,
};

/** Each tab opens its root with `mode: "root"`; `screens` are the root screen ids that belong to it. */
interface Tab { id: string; label: string; icon: IconName; screens: string[]; target: NavigateTarget }

export function App() {
  const { screen, stack, navigate } = useNavigation();
  const { account } = useAccount();
  const tabs: Tab[] = [
    { id: "home", label: "Home", icon: "home", screens: ["home", "post", "media", "unsupported"], target: { kind: "route", url: `${ORIGIN}/home`, mode: "root" } },
    { id: "explore", label: "Explore", icon: "search", screens: ["explore"], target: { kind: "route", url: `${ORIGIN}/explore`, mode: "root" } },
    { id: "notifications", label: "Notifications", icon: "bell", screens: ["notifications"], target: { kind: "route", url: `${ORIGIN}/notifications`, mode: "root" } },
    { id: "saved", label: "Saved", icon: "bookmark", screens: ["saved", "categories", "save", "manage"], target: { kind: "route", url: `${ORIGIN}/i/history`, mode: "root" } },
    {
      id: "profile", label: "Profile", icon: "person", screens: ["account", "profile"],
      target: { kind: "route", url: account ? profileUrl(account.handle!) : `${ORIGIN}/settings/account`, mode: "root" },
    },
  ];
  const Screen = SCREENS[screen.id] ?? UnsupportedScreen;
  const active = tabs.find(tab => tab.screens.includes(stack[0].id)) ?? tabs[0];
  return <div className={screen.id === "media" ? "app viewing" : "app"}>
    <main className="content"><Screen key={screen.key} /></main>
    <nav className="tabs" aria-label="Sections">
      {tabs.map(tab => <button type="button" key={tab.id} className="tab" aria-current={tab === active ? "page" : undefined}
        onClick={() => {
          // Reselecting the current tab on its root scrolls to the top.
          if (tab === active && stack.length === 1) document.querySelector(".screen")?.scrollTo({ top: 0, behavior: "smooth" });
          else void navigate(tab.target);
        }}>
        <Icon name={tab.icon} filled={tab === active} />
        <span>{tab.label}</span>
      </button>)}
    </nav>
  </div>;
}
