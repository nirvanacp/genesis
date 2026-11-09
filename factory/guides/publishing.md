# Publishing

Publish an applet so people can add it to Genesis from its GitHub repository and receive its updates. On the release channel, GitHub Actions rebuilds each tagged version from your sources and publishes the GitHub Release only when the rebuild is identical to the build you committed. Builds installed from a branch or from a file are not rebuilt: Genesis installs the committed build as it is, after checking it against its release record.

## What a release is

| Part | What it is |
| --- | --- |
| Version | `version` in the applet's `package.json`: `MAJOR.MINOR.PATCH` with an optional `-prerelease`, such as `1.2.0` or `1.3.0-beta.1`. Build metadata (`+...`) is refused |
| Published build | `published/applet-<id>.bundle.json` and `published/applet-<id>.release.json` inside the applet, committed with the sources |
| Tag | An annotated git tag on the commit that holds the published build |
| GitHub Release | The release CI creates for the tag, with the bundle, the release record and build provenance attestations |

The release record names the applet, its version, the bundle's SHA-256 and size, the compatibility values, the origins and capabilities Genesis shows before installing, the Genesis commit that built it, and `builtAt`. Leave both files exactly as `publish` wrote them.

A repository holds applets in one of two layouts:

| Layout | Applets | Tag |
| --- | --- | --- |
| Single-applet | `applet.json` at the repository root | `v<version>`, such as `v1.2.0` |
| Multi-applet | Each immediate subdirectory with `applet.json`, named after its applet id | `<id>/v<version>`, such as `notes/v1.2.0` |

A root `applet.json` makes the repository single-applet, and subdirectories are then ignored. `npx genesis-applet applets <repository>` lists the applets with their versions, published builds and last tags, and warns about a directory not named after its applet id.

## Publish a version

Run these from the applet directory unless noted. `publish` runs inside a Genesis checkout, with the applet in the checkout's applets directory: either the whole multi-applet repository is that directory (`genesis.workspace.json` names it), or a single-applet repository is cloned into it as `applets/<id>`.

1. Raise the version: `npm version <patch|minor|major> --no-git-tag-version`. Use a prerelease such as `npm version prerelease --preid beta --no-git-tag-version` for a test release.
2. Write the published build: `npx genesis-applet publish .`. It runs `check`, refuses a version that is not semver, a dependency range that is not an exact version, or uncommitted changes in the Genesis checkout's `packages/`, `tools/`, `package.json` or `package-lock.json`, then builds a release bundle and writes both files into `published/`.
3. Optionally rebuild and compare before committing: `npx genesis-applet publish . --verify`. CI runs the same comparison.
4. Commit the version change and `published/` together.
5. Create the tag: `npx genesis-applet release .`. It refuses uncommitted changes, a published build that is missing, out of date or ignored by git, an existing tag, and a version not higher than the last tag of this applet. It then rebuilds the applet as CI will and refuses a build that differs from `published/`, such as one written before a later source change. The rebuild needs the Genesis checkout at the commit the record names, so run `release` before moving the checkout to another commit. `--dry-run` shows the tag without creating it. It never pushes.
6. Push the commit, then the tag: `git push`, then `git push origin <tag>`. The release workflow publishes the GitHub Release.

`publish` warns when the Genesis commit is on no remote branch. CI checks Genesis out at the recorded commit, so that commit must be on GitHub before you push the tag.

## Set up a repository

Copy the templates from [templates/github](../templates/github/) into the repository:

| Template | Copy to |
| --- | --- |
| `genesis-check.yml` | `.github/workflows/genesis-check.yml` |
| `genesis-release.yml` | `.github/workflows/genesis-release.yml` |
| `dependabot.yml` | `.github/dependabot.yml` |
| `gitattributes` | `.gitattributes` |

In both workflows, replace each `<genesis-sha>` with the same full commit sha of a Genesis commit on GitHub. The check workflow runs on pull requests and pushes to `main`; the release workflow runs on `v*` and `*/v*` tags. `.gitattributes` keeps published builds byte for byte, so a checkout on another system never changes a bundle's hash. Make sure no `.gitignore` rule covers `published/`.

The repository must be public: Genesis reads releases without an account.

The check workflow builds the sources of every pull request, including pull requests from forks, and so runs their `package.json` scripts and build code. It runs with read-only repository access and no secrets, so this is safe while the repository has none. If you add secrets to the repository, keep them out of this workflow.

## Best practices

- Turn on immutable releases in the repository settings, so a published release's assets and tag cannot change.
- Add a tag ruleset that protects `v*` and `*/v*` from updates and deletion.
- Keep every action pinned to a full commit sha and let Dependabot propose updates.
- Keep exact dependency versions. `publish` refuses ranges such as `^1.2.0`.
- Never move, delete and recreate, or reuse a tag. Genesis refuses a release whose build changed after a user installed it.
- To withdraw a bad release, delete the GitHub Release and publish a higher patch version. Users who installed it see that it was withdrawn and are offered the new version.
- Give the applet a prefixed id, such as `yourname-notes`, so it does not collide with another publisher's applet. Never change an id after release: the id keys the user's stored data.
- Run `publish` again after every change to sources or dependencies, before tagging. The check workflow fails when the committed build is not the build the sources produce.

## How people install

In Genesis, the user opens **Add applet** from the Genesis menu on the launcher and enters the repository as `owner/name` or a GitHub URL. A URL can point at a folder on a branch (`/tree/<branch>/<path>`) or a release (`/releases/tag/<tag>`).

- **Release channel**: Genesis lists the applets that have GitHub Releases with a release record and offers the newest stable version that this Genesis supports. Prereleases appear only when the user turns on **Show prereleases**. A `/releases/tag/<tag>` link offers only that release, and Genesis reports when the tag has no applet release.
- **Branch channel**: a `/tree/<branch>` link, or a repository with no qualifying release, offers the committed `published/` build on that branch (the default branch when none is named), pinned to its commit.

Before installing, Genesis shows the name, version, source, origins and capabilities, and asks again when the install would update, downgrade or replace another applet with the same id. Choosing the build that is already installed offers to reinstall it, which only records the new source. Replacing another publisher's applet asks whether to keep or erase its stored data; with erase, Genesis installs the new build only after the old data is deleted, even if the app restarts its screen in between. While an applet's data is being erased, for a replacement or a removal, it cannot be opened, installed or removed.

Genesis checks for updates when the launcher opens, at most every six hours, and on **Check for updates** in the Genesis menu. It offers the newest release newer than the installed one that this Genesis supports, and reports any applet it could not check without stopping the others. An update shows as a badge on the applet and installs only after the user reviews it. Genesis reads up to the newest 1000 releases of a repository, so it reports a release as withdrawn only when it read the whole list. A `/releases/tag/<tag>` link reads that release directly. A user can also install a downloaded `applet-<id>.bundle.json`, together with its `.release.json`, through **Add from file** in the same dialog, or by opening the file with Genesis from another app. **Install another version** on the repository screen installs an older release.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `PUBLISH_MISMATCH` from `publish --verify`, `release` or the check workflow | The listed fields differ between the committed build and a rebuild. Run `publish` again and commit, with the Genesis commit checked out that the record names. A changed line ending in `published/` means `.gitattributes` is missing. The Node version in the record is not compared |
| `release` says the build was made with another Genesis commit | Check out the Genesis commit the record names, or run `publish` again with the current one and commit |
| `was published with Genesis <sha>; check out that commit` | The record names a different Genesis commit than the checkout. Check out that commit, or run `publish` again with the current one |
| The release workflow names a different version for the tag | The tag does not match `package.json`. Delete the unpushed tag, fix the version, publish, commit and tag again |
| The check workflow cannot check out Genesis | The recorded Genesis commit is not on GitHub |
| Genesis shows "GitHub rate limit reached" | Genesis reads GitHub without an account. Try again after the time it shows |
| Genesis shows that a version needs a newer Genesis | The release was built with tools newer than the user's Genesis. Users update Genesis; you can also keep an older release available |
