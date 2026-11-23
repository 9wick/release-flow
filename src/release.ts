import { authoredNotes } from "./body.ts";
import type { GitHub } from "./github.ts";
import { compareVersions, formatVersion, latestVersion, parseVersion, type Version } from "./version.ts";

export type ReleaseRequest = { readonly title: string; readonly body: string };

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
    problems.push(`PR title must be a release version such as 1.2.3, got "${request.title}".`);
  } else if (existingTagSha !== undefined) {
    if (existingTagSha !== releaseSha) {
      problems.push(`${formatVersion(version)} is already released at ${existingTagSha}. Use a newer version.`);
    }
  } else if (latest && compareVersions(version, latest) <= 0) {
    problems.push(`${formatVersion(version)} must be newer than the latest release ${formatVersion(latest)}.`);
  }
  if (authoredNotes(request.body) === "") {
    problems.push("PR description must contain the release notes.");
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
