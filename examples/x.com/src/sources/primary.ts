import { defineSource } from "@genesis/sdk/source";
import { imageUrl, validId, type FeedData, type MediaData, type PostData, type ProfileData, type ProfileHeader } from "../model";
import { BUDGET_BYTES, bytes, clean, emptyText, lines, parsing, primaryColumn, readItems, requireNoError, signedOut } from "./page";

/** A list of posts or notifications; null until X has rendered items or its empty state. */
function feed(doc: Document): FeedData | null {
  const root = primaryColumn(doc);
  if (parsing(doc) || !root) return null;
  requireNoError(root);
  const data = readItems(root);
  return data.items.length > 0 || data.emptyText ? data : null;
}

function profile(doc: Document, params: Record<string, string>): ProfileData | null {
  const root = primaryColumn(doc);
  if (parsing(doc) || !root) return null;
  requireNoError(root);
  const handle = params.handle;
  const nameBox = root.querySelector('[data-testid="UserName"]');
  const nameLines = lines(nameBox);
  let header: ProfileHeader | null = null;
  if (nameBox && nameLines.some(line => line.toLowerCase() === `@${handle.toLowerCase()}`)) {
    const linked = (path: string) => imageUrl(root.querySelector(`a[href="/${handle}/${path}" i] img`)?.getAttribute("src"));
    header = {
      handle,
      name: nameLines[0],
      verified: nameBox.querySelector('[data-testid="icon-verified"]') !== null,
      avatar: linked("photo"),
      banner: linked("header_photo"),
      description: clean(root.querySelector('[data-testid="UserDescription"]')?.textContent, 1000),
      // Each item (location, link, join date) is its own child; textContent would run them together.
      details: clean([...root.querySelector('[data-testid="UserProfileHeader_Items"]')?.children ?? []]
        .map(item => item.textContent?.trim()).filter(Boolean).join(" · "), 300),
      links: [...root.querySelectorAll("a[href]")]
        .filter(a => new RegExp(`^/${handle}/(following|followers|verified_followers)$`, "i").test(a.getAttribute("href") ?? ""))
        .slice(0, 2).map(a => ({ label: clean(a.textContent, 60), url: (a as HTMLAnchorElement).href })),
      own: root.querySelector('[data-testid="editProfileButton"]') !== null,
    };
  }
  const empty = emptyText(root);
  if (!header && !empty) return null;
  const posts = readItems(root, BUDGET_BYTES - bytes(header));
  // The header renders before the posts; wait for one of them or X's empty state.
  if (header && posts.items.length === 0 && !posts.emptyText) return null;
  return { ...posts, profile: header };
}

function post(doc: Document, params: Record<string, string>): PostData | null {
  const root = primaryColumn(doc);
  if (parsing(doc) || !root) return null;
  requireNoError(root);
  const all = readItems(root).items.flatMap(item => item.kind === "post" ? [item.post] : []);
  const at = all.findIndex(entry => entry.postId === params.id);
  if (at < 0) {
    const empty = emptyText(root);
    if (empty) throw new Error(empty);
    return null;
  }
  return { ancestors: all.slice(0, at), focus: all[at], replies: all.slice(at + 1), partial: all.length >= 40 };
}

/** The photo viewer X opens over the post. */
function media(doc: Document): MediaData | null {
  const overlay = doc.querySelector('[data-testid="swipe-to-dismiss"]');
  if (parsing(doc) || !overlay) return null;
  const images = [...doc.querySelectorAll("img")].filter(image => {
    const src = imageUrl(image.getAttribute("src"));
    return src && new URL(src).pathname.startsWith("/media/");
  });
  const middle = innerWidth / 2;
  const selected = images.find(image => {
    const box = image.getBoundingClientRect();
    return box.width > 0 && box.left <= middle && box.right >= middle;
  });
  if (!selected) return null;
  const src = new URL(imageUrl(selected.getAttribute("src"))!);
  if (src.searchParams.has("name")) src.searchParams.set("name", "large");
  return { image: src.href, hasNext: images.some(image => image.getBoundingClientRect().left >= innerWidth - 2) };
}

/** Clicks a post's control and waits for X to show the opposite one. */
function toggle(intent: Record<string, any>, on: string, off: string) {
  if (!validId(intent.postId) || typeof intent.on !== "boolean") throw new Error("Invalid post");
  const post = `article[data-testid="tweet"]:has(a[href$="/status/${intent.postId}"] time)`;
  const [press, expect] = intent.on ? [on, off] : [off, on];
  return [
    { click: `${post} [data-testid="${press}"]` },
    { waitFor: `${post} [data-testid="${expect}"]`, timeoutMs: 8000 },
  ];
}

export default defineSource({
  id: "primary",
  routes: {
    home: { extract: feed },
    notifications: { extract: feed },
    bookmarks: { extract: feed },
    "bookmarks-alias": { extract: feed },
    "own-likes": { extract: feed },
    likes: { extract: feed },
    profile: { extract: profile },
    replies: { extract: profile },
    "profile-media": { extract: profile },
    photo: { extract: media },
    post: { extract: post },
  },
  intents: {
    like: intent => toggle(intent, "like", "unlike"),
    bookmark: intent => toggle(intent, "bookmark", "removeBookmark"),
  },
  /** Home, Notifications, Bookmarks and Likes belong to an account; X shows a login button instead. */
  isSignedIn: doc => parsing(doc) || !signedOut(doc),
});
