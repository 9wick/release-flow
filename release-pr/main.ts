import { writeSection } from "../src/body.ts";
import { withDefaults } from "../src/release.ts";
import { context, input, run, setOutputs } from "../src/runtime.ts";
import { formatVersion, latestVersion, nextPatch, parseVersion } from "../src/version.ts";

run(async () => {
  const { github, branches, tagPrefix } = context();
  const { production, staging } = branches;

  if ((await github.aheadBy(production, staging)) === 0) {
    console.log(`${staging} has nothing that ${production} lacks; no release PR needed.`);
    setOutputs({ "pull-request-number": "", "pull-request-url": "", created: "false" });
    return { ok: true };
  }

  const latest = latestVersion(await github.tagsStartingWith(tagPrefix), tagPrefix);
  const existing = await github.openPullRequest(production, staging);
  const pr =
    existing ??
    (await github.createPullRequest({
      base: production,
      head: staging,
      ...withDefaults({ title: "", body: "" }, latest),
      draft: input("draft") === "true",
    }));

  const changes = await github.generateNotes({
    tag: `${tagPrefix}${formatVersion(parseVersion(pr.title.trim()) ?? nextPatch(latest))}`,
    target: staging,
    previousTag: latest && `${tagPrefix}${formatVersion(latest)}`,
  });
  // The changes section is the only part the bot keeps updating. Re-read so an edit made meanwhile is kept.
  const { body } = await github.getPullRequest(pr.number);
  const updated = writeSection(body, "changes", changes);
  if (updated !== body) await github.updatePullRequest(pr.number, { body: updated });

  setOutputs({
    "pull-request-number": String(pr.number),
    "pull-request-url": pr.url,
    created: String(existing === undefined),
  });
  return { ok: true };
});
