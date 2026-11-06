import { useEffect } from "react";
import { ScrollMemory, useAppResume, useIntent, useNavigation, useScreenSource } from "@genesis/sdk/react";
import { profileUrl, type AccountData } from "../model";
import { LoadError, SignInPrompt, Skeleton } from "../components/ui";

/** The Profile tab before the account is known: it waits for the handle, then becomes the profile. */
export function AccountScreen() {
  const { navigate } = useNavigation();
  const page = useScreenSource<AccountData>();
  const account = useIntent("account");
  // The website sheet may have signed in or out; read the account page again.
  useAppResume(() => void account.act({ name: "reload" }).catch(() => {}));
  const handle = page.stale ? null : page.data?.handle ?? null;

  useEffect(() => {
    if (handle) void navigate({ kind: "route", url: profileUrl(handle), mode: "replace" });
  }, [handle, navigate]);

  let body;
  if (page.status === "auth" || page.status === "unsupported") body = <SignInPrompt reason="Sign in to see your profile and use Saved categories." />;
  else if (page.status === "error") body = <LoadError error={page.error} url={page.url} />;
  else body = <Skeleton label="Loading your profile" rows={3} kind="text" />;

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Profile</h1>
    {body}
  </ScrollMemory>;
}
