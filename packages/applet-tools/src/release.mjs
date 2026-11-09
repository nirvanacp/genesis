import path from 'node:path';
import { readApplet, requireValue, toolError } from './manifest.mjs';
import { genesisRoot, PUBLISHED, publishApplet, readPublished } from './publish.mjs';
import { findRepository, git, listApplets, tagFor, tagsFor } from './repo.mjs';
import { compare } from './semver.mjs';

/** The publish state of one applet: its committed record, whether it is current, and its last tag. */
async function appletState(root, layout, applet) {
  const published = await readPublished(applet.directory, applet.id).catch(error => ({ error: error.message }));
  const tags = git(root, ['rev-parse', '--git-dir'], { allowFailure: true }) === null ? [] : tagsFor(root, layout, applet.id);
  const { directory, ...rest } = applet;
  return {
    ...rest,
    published: published?.record?.version ?? null,
    current: !!published?.record && published.current && published.record.version === applet.version,
    problem: published?.error ?? null,
    tag: tags[0]?.tag ?? null,
    nextTag: tagFor(layout, applet.id, applet.version),
  };
}

/** Lists the applets of a repository directory with their versions, published state and last tag. */
export async function listRepository(directory) {
  const { root, layout, applets, warnings } = await listApplets(directory);
  const states = [];
  for (const applet of applets) states.push(await appletState(root, layout, applet));
  return { root, layout, applets: states, warnings };
}

/**
 * Creates the annotated tag `v<version>` (single-applet repository) or `<id>/v<version>`
 * (multi-applet repository) at HEAD, after checking that the committed release is current and
 * equals a rebuild of the committed source. Never pushes.
 */
export async function releaseApplet(directory, { dryRun = false } = {}) {
  const { root, layout, applet, warnings } = await findRepository(directory);
  const { manifest } = await readApplet(applet.directory);
  const status = git(root, ['status', '--porcelain']);
  requireValue(!status, `The repository ${root} has uncommitted changes; commit them first:\n${status}`);

  const published = await readPublished(applet.directory, manifest.id);
  const relative = path.join(applet.path, PUBLISHED);
  requireValue(published, `${relative} has no release of ${manifest.id}; run genesis-applet publish and commit it`);
  requireValue(published.record.version === applet.version, `${relative} holds version ${published.record.version}, but package.json is ${applet.version}; run genesis-applet publish`);
  requireValue(published.current, `${relative}/${published.record.bundle.file} does not match its release record; run genesis-applet publish`);
  const ignored = git(root, ['check-ignore', '--no-index', path.join(relative, published.record.bundle.file)], { allowFailure: true });
  requireValue(!ignored, `${relative} is ignored by git; remove the ignore rule so the build is committed`);

  const tag = tagFor(layout, manifest.id, applet.version);
  const existing = tagsFor(root, layout, manifest.id);
  requireValue(!existing.some(entry => entry.tag === tag), `Tag ${tag} already exists; raise the version with npm version <patch|minor|major> --no-git-tag-version`);
  const highest = existing[0];
  requireValue(!highest || compare(applet.version, highest.version) > 0, `Version ${applet.version} is not higher than the released ${highest?.version} (${highest?.tag})`);

  // A rebuild catches source changes committed after publish. It must use the recorded Genesis commit.
  const recorded = published.record.toolchain.genesisCommit;
  const genesis = genesisRoot();
  requireValue(genesis, 'release rebuilds the committed build, so it needs the Genesis checkout these tools belong to');
  const head = git(genesis, ['rev-parse', 'HEAD']);
  requireValue(head === recorded, `${relative} was built with Genesis ${recorded.slice(0, 12)}, but this Genesis is at ${head.slice(0, 12)}; run genesis-applet publish and commit published/, or check out Genesis ${recorded.slice(0, 12)}`);
  try { await publishApplet(applet.directory, { verify: true }); }
  catch (error) { throw toolError('PUBLISH_MISMATCH', `${error.message}\nRun genesis-applet publish and commit published/ before releasing.`); }

  const commit = git(root, ['rev-parse', 'HEAD']);
  if (!dryRun) git(root, ['tag', '-a', tag, '-m', `${manifest.id} ${applet.version}`]);
  return {
    appletId: manifest.id, version: applet.version, path: applet.path, layout, tag, commit, created: !dryRun, warnings,
    next: dryRun ? `Run without --dry-run to create ${tag}` : `git push origin ${tag}`,
  };
}
