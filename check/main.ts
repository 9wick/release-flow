import { pullRequestOf } from "../src/event.ts";
import type { GitHub } from "../src/github.ts";
import { verifyRelease, withDefaults, type ReleaseRequest } from "../src/release.ts";
import { context, run, setOutputs } from "../src/runtime.ts";
import { formatVersion, latestVersion, type Version } from "../src/version.ts";

// A PR becomes a release candidate when it opens or leaves draft, so only then are defaults filled in.
// Every later edit belongs to people and is only checked.
const entryActions = new Set(["opened", "ready_for_review"]);

// Reads right before writing so an edit made since the event fired is not overwritten.
const fillDefaults = async (github: GitHub, number: number, latest: Version | undefined): Promise<ReleaseRequest> => {
  const current = await github.getPullRequest(number);
  const filled = withDefaults(current, latest);
  if (filled.title !== current.title || filled.body !== current.body) {
    await github.updatePullRequest(number, {
      ...(filled.title === current.title ? {} : { title: filled.title }),
      ...(filled.body === current.body ? {} : { body: filled.body }),
    });
  }
  return filled;
};

run(async () => {
  const { github, tagPrefix, event } = context();
  const pr = pullRequestOf(event);
  if (!pr) return { ok: false, problems: ["check runs only on pull_request events."] };

  const latest = latestVersion(await github.tagsStartingWith(tagPrefix), tagPrefix);
  const request = entryActions.has(pr.action) ? await fillDefaults(github, pr.number, latest) : pr;
  const result = await verifyRelease(github, tagPrefix, request, latest);
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({ version, tag: `${tagPrefix}${version}` });
  return { ok: true };
});
