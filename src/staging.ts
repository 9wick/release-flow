import type { GitHub } from "./github.ts";
import { lastStagingNumber, stagingVersion, type Version } from "./version.ts";

/**
 * Tags `sha` with the next staging version and returns it.
 * A rerun for the same commit reuses its tag; a concurrent run that took the number first moves this one to the next.
 */
export const tagStagingVersion = async (
  github: GitHub,
  tags: readonly string[],
  prefix: string,
  latest: Version | undefined,
  sha: string,
): Promise<string> => {
  const last = lastStagingNumber(tags, prefix, latest);
  if (last !== undefined) {
    const version = stagingVersion(latest, last);
    if ((await github.tagCommit(`${prefix}${version}`)) === sha) return version;
  }
  for (let number = last === undefined ? 0 : last + 1; ; number++) {
    const version = stagingVersion(latest, number);
    if (await github.createTag(`${prefix}${version}`, sha)) return version;
  }
};
