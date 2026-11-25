import { releaseNotes } from "../src/body.ts";
import { environmentOf } from "../src/environment.ts";
import { pullRequestOf } from "../src/event.ts";
import { verifyRelease } from "../src/release.ts";
import { context, input, run, setOutputs } from "../src/runtime.ts";
import { tagStagingVersion } from "../src/staging.ts";
import { formatVersion, isPrereleaseLabel, latestVersion, previewVersion } from "../src/version.ts";

run(async () => {
  const { github, branches, tagPrefix, event, ref, sha } = context();
  const labels = { stg: input("staging-prerelease"), dev: input("development-prerelease") };
  const invalid = Object.values(labels).filter((label) => !isPrereleaseLabel(label));
  if (invalid.length > 0) {
    return {
      ok: false,
      problems: invalid.map(
        (label) => `"${label}" is not a pre-release label. Use letters, digits and hyphens with at least one non-digit, such as beta.`,
      ),
    };
  }
  const pr = pullRequestOf(event);
  // A merged PR deploys its base branch at the merge commit; an open PR previews its head.
  const target = pr
    ? pr.mergeSha
      ? { branch: pr.baseBranch, sha: pr.mergeSha }
      : { branch: pr.headBranch, sha: pr.headSha }
    : { branch: ref, sha };
  const environment = environmentOf(target.branch, branches);
  const tags = await github.tagsStartingWith(tagPrefix);
  const latest = latestVersion(tags, tagPrefix);
  if (environment !== "prod") {
    const version =
      environment === "stg"
        ? await tagStagingVersion(github, tags, tagPrefix, latest, labels.stg, target.sha)
        : previewVersion(latest, labels.dev, new Date());
    setOutputs({
      environment,
      version,
      tag: `${tagPrefix}${version}`,
      notes: "",
      sha: target.sha,
      "pull-request-number": "",
    });
    return { ok: true };
  }

  const release = pr?.mergeSha ? pr : await github.mergedPullRequestOf(target.sha, branches.production);
  if (!release) {
    return {
      ok: false,
      problems: [`${target.sha} on ${branches.production} did not come from a merged PR, so it has no version.`],
    };
  }
  const result = await verifyRelease(github, tagPrefix, release, latest, target.sha);
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({
    environment,
    version,
    tag: `${tagPrefix}${version}`,
    notes: releaseNotes(release.body),
    sha: target.sha,
    "pull-request-number": String(release.number),
  });
  return { ok: true };
});
