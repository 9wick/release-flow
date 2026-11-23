import { pullRequestOf } from "../src/event.ts";
import { verifyRelease } from "../src/release.ts";
import { context, run, setOutputs } from "../src/runtime.ts";
import { formatVersion } from "../src/version.ts";

run(async () => {
  const { github, tagPrefix, event } = context();
  const pr = pullRequestOf(event);
  if (!pr) return { ok: false, problems: ["check runs only on pull_request events."] };

  const result = await verifyRelease(github, tagPrefix, pr);
  if (!result.ok) return result;

  const version = formatVersion(result.version);
  setOutputs({ version, tag: `${tagPrefix}${version}` });
  return { ok: true };
});
