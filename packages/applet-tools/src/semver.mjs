import { compareVersions, parseVersion } from '@genesis/core';

export { compareVersions as compare, parseVersion as parse };

/**
 * A dependency range is exact when it names one full semver version, or links a local package
 * with `file:` or `workspace:`. Anything else (`^`, `~`, `*`, `x`, ranges, tags) can resolve
 * differently later, so a published build would not be reproducible.
 */
export function isExact(range) {
  return typeof range === 'string' && (parseVersion(range) !== null || /^(file|workspace):/.test(range));
}
