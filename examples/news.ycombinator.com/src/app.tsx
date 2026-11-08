import type { ComponentType } from "react";
import { useNavigation } from "@genesis/sdk/react";
import { Icon, type IconName } from "./components/ui";
import { CategoriesScreen } from "./screens/categories";
import { FeedScreen } from "./screens/feed";
import { InfoScreen } from "./screens/info";
import { ItemScreen } from "./screens/item";
import { MeScreen } from "./screens/me";
import { PostScreen } from "./screens/post";
import { SaveScreen } from "./screens/save";
import { SavedScreen } from "./screens/saved";
import { SearchScreen } from "./screens/search";
import { UserScreen } from "./screens/user";

const SCREENS: Record<string, ComponentType> = {
  feed: FeedScreen, item: ItemScreen, user: UserScreen, info: InfoScreen, search: SearchScreen,
  post: PostScreen, saved: SavedScreen, categories: CategoriesScreen, save: SaveScreen, me: MeScreen,
};

/**
 * The tabs. Home, Post and Me are website contexts, each with its own history; Search and Saved
 * are applet screens opened as the root of the overlay. A tab's id is its context or screen.
 */
const TABS: { id: string; label: string; icon: IconName; context: boolean }[] = [
  { id: "primary", label: "Home", icon: "home", context: true },
  { id: "search", label: "Search", icon: "search", context: false },
  { id: "post", label: "Post", icon: "post", context: true },
  { id: "saved", label: "Saved", icon: "bookmark", context: false },
  { id: "me", label: "Me", icon: "person", context: true },
];

export function App() {
  const { screen, active, overlay, select, navigate } = useNavigation();
  const Screen = screen ? SCREENS[screen.id] : undefined;
  // An overlay opened from a tab (Save from Saved, say) keeps that tab current.
  const root = overlay[0]?.id;
  const current = root === "search" || root === "saved" ? root : overlay.length > 0 ? null : active;
  return <div className="app">
    <main className="content">{Screen && <Screen key={screen!.key} />}</main>
    <nav className="tabs" aria-label="Sections">
      {TABS.map(tab => {
        const here = tab.id === current;
        // Selecting the current context returns it to its start page; Genesis handles that in select.
        const choose = () => tab.context ? select(tab.id) : navigate({ screen: tab.id, mode: "root" });
        return <button type="button" key={tab.id} className="tab" aria-current={here ? "page" : undefined} onClick={choose}>
          <Icon name={tab.icon} filled={here} />
          <span>{tab.label}</span>
        </button>;
      })}
    </nav>
  </div>;
}
