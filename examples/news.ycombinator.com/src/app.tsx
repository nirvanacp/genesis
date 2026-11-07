import type { ComponentType } from "react";
import { useNavigation } from "@genesis/sdk/react";
import type { NavigateTarget } from "@genesis/sdk";
import { ORIGIN } from "./model";
import { Icon, type IconName } from "./components/ui";
import { FeedScreen } from "./screens/feed";
import { InfoScreen } from "./screens/info";
import { ItemScreen } from "./screens/item";
import { accountUrl, MeScreen } from "./screens/me";
import { PostScreen } from "./screens/post";
import { SaveScreen } from "./screens/save";
import { SavedScreen } from "./screens/saved";
import { SearchScreen } from "./screens/search";
import { UnsupportedScreen } from "./screens/unsupported";
import { UserScreen } from "./screens/user";

const SCREENS: Record<string, ComponentType> = {
  feed: FeedScreen, item: ItemScreen, user: UserScreen, info: InfoScreen, search: SearchScreen,
  post: PostScreen, saved: SavedScreen, save: SaveScreen, me: MeScreen, unsupported: UnsupportedScreen,
};

/** Each tab opens its root with `mode: "root"`; `screens` are the root screen ids that belong to it. */
const TABS: { id: string; label: string; icon: IconName; screens: string[]; target: NavigateTarget }[] = [
  { id: "home", label: "Home", icon: "home", screens: ["feed", "item", "user", "info", "unsupported"], target: { kind: "route", url: `${ORIGIN}/`, mode: "root" } },
  { id: "search", label: "Search", icon: "search", screens: ["search"], target: { kind: "screen", id: "search", mode: "root" } },
  { id: "post", label: "Post", icon: "post", screens: ["post"], target: { kind: "route", url: `${ORIGIN}/submit`, mode: "root" } },
  { id: "saved", label: "Saved", icon: "bookmark", screens: ["saved", "save"], target: { kind: "screen", id: "saved", mode: "root" } },
  { id: "me", label: "Me", icon: "person", screens: ["me"], target: { kind: "route", url: accountUrl(), mode: "root" } },
];

export function App() {
  const { screen, stack, navigate } = useNavigation();
  const Screen = SCREENS[screen.id] ?? UnsupportedScreen;
  const active = TABS.find(tab => tab.screens.includes(stack[0].id)) ?? TABS[0];
  return <div className="app">
    <main className="content"><Screen key={screen.key} /></main>
    <nav className="tabs" aria-label="Sections">
      {TABS.map(tab => <button type="button" key={tab.id} className="tab" aria-current={tab === active ? "page" : undefined}
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
