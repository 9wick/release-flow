import { readSection, withNotesSection } from "../src/body.ts";
import { pullRequestOf } from "../src/event.ts";
import type { GitHub } from "../src/github.ts";
import { verifyRelease } from "../src/release.ts";
import { context, run, setOutputs } from "../src/runtime.ts";
import { formatVersion } from "../src/version.ts";

// Reads the body right before writing so a newer edit by a person is not overwritten with the event's copy.
const addNotesSection = async (github: GitHub, number: number): Promise<void> => {
  const { body } = await github.getPullRequest(number);
  const updated = withNotesSection(body);
  if (updated !== body) await github.updatePullRequest(number, { body: updated });
};

run(async () => {
  const { github, tagPrefix, event } = context();
  const pr = pullRequestOf(event);
  if (!pr) return { ok: false, problems: ["check runs only on pull_request events."] };

  if (readSection(pr.body, "notes") === undefined) await addNotesSection(github, pr.number);

  const result = await verifyRelease(github, tagPrefix, pr);
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({ version, tag: `${tagPrefix}${version}` });
  return { ok: true };
});
