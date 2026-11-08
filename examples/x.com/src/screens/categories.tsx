import { useEffect, useState, type ReactNode } from "react";
import { ScrollMemory, useNavigation, useRecords } from "@genesis/sdk/react";
import { libraryMessage, useLibrary, type Bookmark } from "../library";
import { profileUrl } from "../model";
import { Icon, Notice, SignInPrompt, Skeleton, useOpenUrl } from "../components/ui";
import { SavedTabs } from "./feed";

type Library = ReturnType<typeof useLibrary>;

/** The filter and search kept per library in the `preferences` collection, in the first release's shape. */
interface Preferences { query: string; categoryId: string | null; scroll: number }

/**
 * What stands between the screen and the library: sign-in, a different account, an unreachable
 * service, or a change whose outcome is unknown. Returns null when the library is usable.
 */
export function LibraryGate({ library, children }: { library: Library; children?: ReactNode }) {
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const code = (library.error as { code?: string } | null)?.code;
  if (code === "SIGN_IN") return <SignInPrompt reason="Categories belong to your X account. Sign in to use them." />;
  if (code === "ACCOUNT_UNKNOWN" || (library.loading && !library.library)) return <Skeleton label="Loading categories" rows={4} kind="text" />;
  if (library.error) return <Notice title={code === "ACCOUNT_MISMATCH" ? "Different account" : "Categories are unavailable"} role="alert">
    <p>{libraryMessage(library.error)}</p>
    {code !== "ACCOUNT_MISMATCH" && <button type="button" className="secondary" onClick={library.reload}>Try again</button>}
  </Notice>;
  if (library.pending) return <Notice title="Check the last change" role="alert">
    <p>The last change to your categories may not have finished. Check it before making another.</p>
    {message && <p className="inline-error">{message}</p>}
    <button type="button" className="primary" disabled={checking} onClick={() => {
      setChecking(true);
      setMessage("");
      library.check().catch(error => setMessage(libraryMessage(error))).finally(() => setChecking(false));
    }}>{checking ? "Checking…" : "Check last change"}</button>
  </Notice>;
  return <>{children}</>;
}

/** Saved posts filed into the user's own categories, kept by the applet's service. */
export function CategoriesScreen() {
  const { navigate } = useNavigation();
  const library = useLibrary();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<{ entries: Bookmark[]; cursor: string | null; loading: boolean; error: unknown }>(
    { entries: [], cursor: null, loading: true, error: null });
  const revision = library.library?.revision;
  const { service } = library;

  // The last filter and search for this library come back before the first query; changes are kept.
  const preferences = useRecords<Preferences>("preferences");
  const key = library.library ? `library:${library.library.libraryId}` : null;
  const saved = key ? (preferences.records.find(record => record.key === key)
    ?? preferences.records.find(record => record.key === "library"))?.value ?? null : null;
  const [applied, setApplied] = useState<string | null>(null);
  useEffect(() => {
    if (!key || preferences.loading || applied === key) return;
    setApplied(key);
    if (typeof saved?.query === "string") { setQuery(saved.query); setDraft(saved.query); }
    if (saved?.categoryId && library.categories.some(category => category.id === saved.categoryId)) setCategoryId(saved.categoryId);
  }, [key, preferences.loading, applied, saved, library.categories]);
  useEffect(() => {
    const unchanged = saved ? saved.query === query && saved.categoryId === categoryId : !query && categoryId === null;
    if (!key || applied !== key || unchanged) return;
    void preferences.put(key, { query, categoryId, scroll: saved?.scroll ?? 0 }).catch(() => {});
  }, [key, applied, query, categoryId]); // Only the user's changes write; reading `saved` back does not.
  const usable = !!library.library && !library.error && !library.pending && applied === key;

  // A new filter, search or library revision starts the list over.
  useEffect(() => {
    if (!usable) return;
    let active = true;
    setPage(previous => ({ ...previous, loading: true, error: null }));
    service.query(categoryId, query, null).then(result => {
      if (active) setPage({ entries: result.entries, cursor: result.nextCursor, loading: false, error: null });
    }, error => {
      if (active) setPage(previous => ({ ...previous, loading: false, error }));
    });
    return () => { active = false; };
  }, [usable, service, categoryId, query, revision]);

  const more = () => {
    if (!page.cursor || page.loading) return;
    setPage(previous => ({ ...previous, loading: true }));
    service.query(categoryId, query, page.cursor).then(result => {
      setPage(previous => ({ entries: [...previous.entries, ...result.entries], cursor: result.nextCursor, loading: false, error: null }));
    }, error => setPage(previous => ({ ...previous, loading: false, error })));
  };

  const names = new Map(library.categories.map(category => [category.id, category.name]));
  const total = library.categories.reduce((sum, category) => sum + category.count, 0);

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Saved</h1>
    <SavedTabs active="categories" />
    <LibraryGate library={library}>
      <div className="chips" role="group" aria-label="Filter by category">
        <button type="button" className="chip" aria-pressed={categoryId === null} onClick={() => setCategoryId(null)}>All</button>
        {library.categories.map(category => <button type="button" key={category.id} className="chip" aria-pressed={categoryId === category.id}
          onClick={() => setCategoryId(category.id)}>{category.name} <span className="chip-count">{category.count}</span></button>)}
      </div>
      <form className="search-form" role="search" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); }}>
        <label className="search-field"><Icon name="search" /><span className="visually-hidden">Search saved posts</span>
          <input type="search" placeholder="Search saved posts" value={draft} enterKeyHint="search"
            onChange={event => { setDraft(event.target.value); if (!event.target.value) setQuery(""); }} />
        </label>
      </form>
      <button type="button" className="secondary" onClick={() => navigate({ screen: "manage" })}>
        <Icon name="folder" /> Manage categories
      </button>
      {page.error != null && <p className="inline-error" role="alert">{libraryMessage(page.error)}</p>}
      {page.entries.length === 0 && !page.loading && !page.error && <Notice title={query ? "No matches" : library.categories.length ? "Nothing filed here" : "No categories yet"}>
        <p>{query ? "Try other words." : library.categories.length
          ? total ? "No saved posts in this category." : "Tap the folder on any post to file it."
          : "Create a category, then tap the folder on any post to file it."}</p>
      </Notice>}
      <div className="feed">
        {page.entries.map(entry => <SavedRow key={entry.postId} entry={entry} names={names} />)}
      </div>
      {page.loading && <Skeleton label="Loading saved posts" rows={page.entries.length ? 1 : 4} />}
      {page.cursor && !page.loading && <button type="button" className="secondary more" onClick={more}>Load more</button>}
    </LibraryGate>
  </ScrollMemory>;
}

function SavedRow({ entry, names }: { entry: Bookmark; names: Map<string, string> }) {
  const open = useOpenUrl();
  const { navigate } = useNavigation();
  const { snapshot } = entry;
  return <article className="post saved-post">
    <div className="post-body">
      <header className="post-head">
        <a className="post-name" href={profileUrl(snapshot.authorHandle)} onClick={event => { event.preventDefault(); open(profileUrl(snapshot.authorHandle)); }}>
          <strong>{snapshot.authorName}</strong>
        </a>
        <span className="post-meta">@{snapshot.authorHandle}</span>
      </header>
      <button type="button" className="post-content plain" onClick={() => open(entry.url)}>
        <span className="post-text" dir="auto">{snapshot.text || (snapshot.media.count ? `${snapshot.media.count} ${snapshot.media.kind === "video" ? "video" : "media"}` : "Post")}</span>
      </button>
      <div className="pills">
        {entry.categoryIds.map(id => names.has(id) && <span key={id} className="pill">{names.get(id)}</span>)}
        <button type="button" className="text-button" onClick={() => navigate({
          screen: "save", params: { post: JSON.stringify({ postId: entry.postId, url: entry.url, snapshot }) },
        })}>Edit</button>
      </div>
    </div>
  </article>;
}
