import type { ComponentType } from "react";
import { useNavigation } from "@genesis/sdk/react";
import { Icon, type IconName } from "./components/ui";
import { FeedScreen } from "./screens/feed";
import { ItemScreen } from "./screens/item";
import { UserScreen } from "./screens/user";

const SCREENS: Record<string, ComponentType> = { feed: FeedScreen, item: ItemScreen, user: UserScreen };

/** Search, Post, Saved and Me return with their contexts and screens in step 8. */
const LATER: { label: string; icon: IconName }[] = [
  { label: "Search", icon: "search" },
  { label: "Post", icon: "post" },
  { label: "Saved", icon: "bookmark" },
  { label: "Me", icon: "person" },
];

export function App() {
  const { screen, active, select } = useNavigation();
  const Screen = screen ? SCREENS[screen.id] : undefined;
  const home = active === "primary";
  return <div className="app">
    <main className="content">{Screen && <Screen key={screen!.key} />}</main>
    <nav className="tabs" aria-label="Sections">
      {/* Selecting Home on its start page scrolls to the top; elsewhere it returns to the start page. */}
      <button type="button" className="tab" aria-current={home ? "page" : undefined} onClick={() => select("primary")}>
        <Icon name="home" filled={home} />
        <span>Home</span>
      </button>
      {LATER.map(tab => <button type="button" key={tab.label} className="tab" disabled aria-label={`${tab.label} (coming soon)`}>
        <Icon name={tab.icon} />
        <span>{tab.label}</span>
      </button>)}
    </nav>
  </div>;
}
