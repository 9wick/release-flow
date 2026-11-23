import { environmentOf } from "../src/environment.ts";
import { pullRequestOf } from "../src/event.ts";
import { verifyRelease } from "../src/release.ts";
import { context, run, setOutputs } from "../src/runtime.ts";
import { formatVersion, latestVersion, previewVersion } from "../src/version.ts";

run(async () => {
  const { github, branches, tagPrefix, event, ref, sha } = context();
  const pr = pullRequestOf(event);
  // A merged PR deploys its base branch at the merge commit; an open PR previews its head.
  const target = pr
    ? pr.mergeSha
      ? { branch: pr.baseBranch, sha: pr.mergeSha }
      : { branch: pr.headBranch, sha: pr.headSha }
    : { branch: ref, sha };
  const environment = environmentOf(target.branch, branches);
  if (environment !== "prod") {
    const latest = latestVersion(await github.tagsStartingWith(tagPrefix), tagPrefix);
    const version = previewVersion(latest, environment, new Date());
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
  const result = await verifyRelease(github, tagPrefix, release, target.sha);
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({
    environment,
    version,
    tag: `${tagPrefix}${version}`,
    notes: release.body.trim(),
    sha: target.sha,
    "pull-request-number": String(release.number),
  });
  return { ok: true };
});
