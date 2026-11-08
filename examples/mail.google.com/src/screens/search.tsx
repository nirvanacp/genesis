import { useState } from "react";
import { ScrollMemory, useNavigation } from "@genesis/sdk/react";
import { useItems, useNow, useSettings } from "../store";
import { Icon, IconButton } from "../components/ui";
import { ItemRow } from "../components/items";
import { useMailNav, useOpenItem } from "../components/mail";

const SUGGESTIONS = [
  { label: "Unread", query: "is:unread" },
  { label: "Starred", query: "is:starred" },
  { label: "Has attachment", query: "has:attachment" },
  { label: "Last 7 days", query: "newer_than:7d" },
];

/** Search entry: recent searches, Gmail filters and matching to-dos. Param: `q`. */
export function SearchScreen() {
  const { screen, back } = useNavigation();
  const nav = useMailNav();
  const { settings, update } = useSettings();
  const { items } = useItems();
  const openItem = useOpenItem();
  const now = useNow();
  const [query, setQuery] = useState(screen?.params.q ?? "");

  const run = (text: string) => {
    const value = text.trim();
    if (!value) return;
    void update({ recentSearches: [value, ...settings.recentSearches.filter(entry => entry !== value)].slice(0, 8) });
    nav.search(value);
  };

  const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 1 && !word.includes(":"));
  const matches = words.length ? items.filter(item => !item.snooze && words.every(word =>
    `${item.title} ${item.note} ${item.link?.subject ?? ""} ${item.link?.sender ?? ""}`.toLowerCase().includes(word))).slice(0, 5) : [];

  return <div className="screen-frame search-screen">
    <header className="mail-header">
      <form className="search-pill" role="search" onSubmit={event => { event.preventDefault(); run(query); }}>
        <IconButton icon="back" label="Back" onClick={back} />
        <input type="search" autoFocus enterKeyHint="search" placeholder="Search in mail" aria-label="Search in mail"
          value={query} onChange={event => setQuery(event.target.value)} />
        {query && <IconButton icon="close" label="Clear" onClick={() => setQuery("")} />}
      </form>
    </header>
    <ScrollMemory className="screen">
      <nav className="filter-chips" aria-label="Search for">
        {SUGGESTIONS.map(entry => <button type="button" key={entry.query} className="filter-chip" onClick={() => run(query ? `${query} ${entry.query}` : entry.query)}>{entry.label}</button>)}
      </nav>
      {matches.length > 0 && <section>
        <h2 className="section-label">In your to-do</h2>
        <ul className="item-list card">{matches.map(item => <ItemRow key={item.id} item={item} now={now} onOpen={() => openItem(item.id)} />)}</ul>
      </section>}
      {settings.recentSearches.length > 0 && <section>
        <h2 className="section-label with-action">
          <span>Recent</span>
          <button type="button" className="link-button" onClick={() => void update({ recentSearches: [] })}>Clear</button>
        </h2>
        <ul className="plain-list card">
          {settings.recentSearches.map(entry => <li key={entry}>
            <button type="button" className="list-button" onClick={() => run(entry)}><Icon name="clock" /><span>{entry}</span><Icon name="up" /></button>
          </li>)}
        </ul>
      </section>}
      {query.trim() && <button type="button" className="accent block padded-x" onClick={() => run(query)}><Icon name="search" /> Search for “{query.trim()}”</button>}
    </ScrollMemory>
  </div>;
}
