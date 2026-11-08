import { useEffect } from "react";
import { ScrollMemory, useNavigation, usePage, useRecord } from "@genesis/sdk/react";
import { profileUrl, type AccountData } from "../model";
import { LoadError, SignInPrompt, Skeleton } from "../components/ui";

/** The Profile tab's start page, X's account settings: it waits for the handle, then becomes the profile. */
export function AccountScreen() {
  const { navigate } = useNavigation();
  const page = usePage();
  const record = useRecord<AccountData | null>("handle", null);
  const handle = page.stale || page.pageId !== "account" ? null : record?.data?.handle ?? page.account;

  useEffect(() => {
    if (handle) navigate({ url: profileUrl(handle), context: "account", mode: "replace" });
  }, [handle, navigate]);

  let body;
  if (page.status === "auth") body = <SignInPrompt reason="Sign in to see your profile and use Saved categories." />;
  else if (page.status === "error") body = <LoadError error={page.error} />;
  else body = <Skeleton label="Loading your profile" rows={3} kind="text" />;

  return <ScrollMemory className="screen">
    <h1 className="screen-title">Profile</h1>
    {body}
  </ScrollMemory>;
}
