import { withNotesSection } from "../src/body.ts";
import { pullRequestOf } from "../src/event.ts";
import { verifyRelease } from "../src/release.ts";
import { context, run, setOutputs } from "../src/runtime.ts";
import { formatVersion } from "../src/version.ts";

run(async () => {
  const { github, tagPrefix, event } = context();
  const pr = pullRequestOf(event);
  if (!pr) return { ok: false, problems: ["check runs only on pull_request events."] };

  // The event payload can be stale, and the section must be added to the body as it is now.
  const { title, body } = await github.getPullRequest(pr.number);
  const withSection = withNotesSection(body);
  if (withSection !== body) await github.updatePullRequestBody(pr.number, withSection);

  const result = await verifyRelease(github, tagPrefix, { title, body: withSection });
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({ version, tag: `${tagPrefix}${version}` });
  return { ok: true };
});
