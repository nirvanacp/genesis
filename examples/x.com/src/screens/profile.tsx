import { ScrollMemory, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { ORIGIN, profileUrl, type ProfileData, type ProfileHeader } from "../model";
import { usePostActions } from "../components/post";
import { Avatar, LoadError, ModeTabs, Notice, OpenOnX, Skeleton, useOpenRoute, Verified } from "../components/ui";
import { FeedList } from "./feed";

const TABS = [{ id: "profile", label: "Posts", path: "" }, { id: "replies", label: "Replies", path: "/with_replies" }, { id: "profile-media", label: "Media", path: "/media" }];

export function ProfileScreen() {
  const { screen, navigate } = useNavigation();
  const page = useScreenSource<ProfileData>();
  const { actions, error: actionError } = usePostActions(page.stale);
  const handle = page.params.handle ?? "";
  const routeId = screen.source?.routeId ?? "profile";
  const data = page.data;

  let body;
  if (!data) body = page.status === "error" ? <LoadError error={page.error} url={page.url} />
    : page.status === "unsupported" ? <Notice title="This page moved"><p>X sent this profile somewhere the app doesn't show.</p>{page.url && <OpenOnX url={page.url} />}</Notice>
    : <Skeleton label="Loading profile" />;
  else body = <>
    {page.status === "error" && <p className="inline-error" role="alert">Couldn't refresh. Showing the last copy.</p>}
    {data.profile ? <Header profile={data.profile} /> : <h1 className="screen-title">@{handle}</h1>}
    <ModeTabs label="Profile sections" active={routeId} options={TABS.map(tab => ({
      ...tab, go: () => void navigate({ kind: "route", url: `${profileUrl(handle)}${tab.path}`, mode: "replace" }),
    }))} />
    {actionError != null && <p className="inline-error" role="alert">That didn't go through on X. Try again.</p>}
    {data.items.length === 0
      ? <Notice title={data.emptyText ?? "No posts yet"}><p>{data.profile ? "Posts show up here." : "X has nothing to show for this account."}</p></Notice>
      : <FeedList items={data.items} actions={actions} />}
    {data.partial && page.url && <div className="more"><OpenOnX url={page.url} label="See more on X" /></div>}
  </>;

  return <ScrollMemory className="screen profile-screen" aria-busy={page.stale}>{body}</ScrollMemory>;
}

function Header({ profile }: { profile: ProfileHeader }) {
  const open = useOpenRoute();
  return <header className="profile">
    <div className="banner">{profile.banner && <img src={profile.banner} alt="" referrerPolicy="no-referrer" />}</div>
    <div className="profile-top">
      <Avatar src={profile.avatar} size={80} />
      {profile.own && <OpenOnX url={`${ORIGIN}/settings/profile`} label="Edit profile" />}
    </div>
    <h1 className="profile-name">{profile.name}{profile.verified && <Verified />}</h1>
    <p className="post-meta">@{profile.handle}</p>
    {profile.description && <p className="post-text" dir="auto">{profile.description}</p>}
    {profile.details && <p className="post-meta">{profile.details}</p>}
    {profile.links.length > 0 && <p className="profile-links">
      {profile.links.map(link => <a key={link.url} href={link.url} onClick={event => { event.preventDefault(); open(link.url); }}>{link.label}</a>)}
    </p>}
  </header>;
}
