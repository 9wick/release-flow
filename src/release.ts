import { releaseNotes } from "./body.ts";
import type { GitHub } from "./github.ts";
import { compareVersions, formatVersion, latestVersion, nextPatch, parseVersion, type Version } from "./version.ts";

export type ReleaseRequest = { readonly title: string; readonly body: string };

/**
 * The bot proposes latest + patch and people override it. A version that a release has since caught up with
 * (a hotfix took it) is reset to the new proposal. Newer versions are people's choice, and malformed titles
 * may be a typo for a bigger bump, so both are left for people and check.
 */
export const proposedTitle = (title: string, latest: Version | undefined): string => {
  const version = parseVersion(title.trim());
  return version && latest && compareVersions(version, latest) <= 0 ? formatVersion(nextPatch(latest)) : title;
};

export type ReleaseCheck =
  | { readonly ok: true; readonly version: Version }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * `existingTagSha` is the commit the version's tag already points to, if any.
 * `releaseSha` is the commit being released; a tag already on it means a re-run.
 * Before merge there is no `releaseSha`, so any existing tag means the version is taken.
 */
export const checkRelease = (
  request: ReleaseRequest,
  latest: Version | undefined,
  existingTagSha: string | undefined,
  releaseSha?: string,
): ReleaseCheck => {
  const version = parseVersion(request.title.trim());
  const problems: string[] = [];
  if (!version) {
    problems.push(`PR title must be a release version such as ${formatVersion(nextPatch(latest))}, got "${request.title}".`);
  } else if (existingTagSha !== undefined) {
    if (existingTagSha !== releaseSha) {
      problems.push(
        `${formatVersion(version)} is already released at ${existingTagSha}. Use a newer version such as ${formatVersion(nextPatch(latest))}.`,
      );
    }
  } else if (latest && compareVersions(version, latest) <= 0) {
    problems.push(
      `${formatVersion(version)} must be newer than the latest release ${formatVersion(latest)}, such as ${formatVersion(nextPatch(latest))}.`,
    );
  }
  if (releaseNotes(request.body) === "") {
    problems.push(
      "PR description must contain the release notes between <!-- release-flow:notes --> and <!-- /release-flow:notes -->.",
    );
  }
  return version && problems.length === 0 ? { ok: true, version } : { ok: false, problems };
};

export const verifyRelease = async (
  github: Pick<GitHub, "tagsStartingWith" | "tagCommit">,
  tagPrefix: string,
  request: ReleaseRequest,
  releaseSha?: string,
): Promise<ReleaseCheck> => {
  const latest = latestVersion(await github.tagsStartingWith(tagPrefix), tagPrefix);
  const requested = parseVersion(request.title.trim());
  const existingTagSha = requested && (await github.tagCommit(`${tagPrefix}${formatVersion(requested)}`));
  return checkRelease(request, latest, existingTagSha, releaseSha);
};
