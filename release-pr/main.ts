import { notesTemplate, writeSection } from "../src/body.ts";
import { proposedTitle } from "../src/release.ts";
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
      title: formatVersion(nextPatch(latest)),
      body: notesTemplate,
      draft: input("draft") === "true",
    }));

  const changes = await github.generateNotes({
    tag: `${tagPrefix}${formatVersion(parseVersion(proposedTitle(pr.title, latest).trim()) ?? nextPatch(latest))}`,
    target: staging,
    previousTag: latest && `${tagPrefix}${formatVersion(latest)}`,
  });
  // Re-read right before writing so an edit made while notes were generated is kept.
  const current = await github.getPullRequest(pr.number);
  const title = proposedTitle(current.title, latest);
  const body = writeSection(current.body, "changes", changes);
  if (title !== current.title || body !== current.body) {
    await github.updatePullRequest(pr.number, {
      ...(title === current.title ? {} : { title }),
      ...(body === current.body ? {} : { body }),
    });
  }

  setOutputs({
    "pull-request-number": String(pr.number),
    "pull-request-url": pr.url,
    created: String(existing === undefined),
  });
  return { ok: true };
});
