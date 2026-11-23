import { releaseNotes, withNotesSection } from "./body.ts";
import type { GitHub } from "./github.ts";
import { compareVersions, formatVersion, nextPatch, parseVersion, type Version } from "./version.ts";

export type ReleaseRequest = { readonly title: string; readonly body: string };

// A title that already tries to be a version (v1.3.0, 1.3) is kept so check can point at the typo,
// instead of silently replacing an intended minor or major bump with a patch.
const triesVersion = /\d+\.\d+/;

/** Fills in only what nobody has written yet: the latest + patch version and an empty notes section. */
export const withDefaults = (request: ReleaseRequest, latest: Version | undefined): ReleaseRequest => ({
  title: triesVersion.test(request.title) ? request.title : formatVersion(nextPatch(latest)),
  body: withNotesSection(request.body),
});

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
  github: Pick<GitHub, "tagCommit">,
  tagPrefix: string,
  request: ReleaseRequest,
  latest: Version | undefined,
  releaseSha?: string,
): Promise<ReleaseCheck> => {
  const requested = parseVersion(request.title.trim());
  const existingTagSha = requested && (await github.tagCommit(`${tagPrefix}${formatVersion(requested)}`));
  return checkRelease(request, latest, existingTagSha, releaseSha);
};
