import assert from "node:assert/strict";
import { test } from "node:test";
import { authoredNotes, withChanges } from "../src/body.ts";
import { environmentOf } from "../src/environment.ts";
import { checkRelease } from "../src/release.ts";
import { latestVersion, nextPatch, parseVersion, previewVersion } from "../src/version.ts";

const v = (text: string) => parseVersion(text)!;

test("latest version ignores previews, other prefixes and sorts numerically", () => {
  const tags = ["v1.2.9", "v1.10.0", "v2.0.0-stg.1", "x9.9.9", "v1.2.10", "release"];
  assert.deepEqual(latestVersion(tags, "v"), v("1.10.0"));
  assert.equal(latestVersion([], "v"), undefined);
});

test("versions with a v, a suffix or leading zeros are not release versions", () => {
  for (const text of ["v1.2.3", "1.2", "1.2.3-rc.1", "01.2.3", " 1.2.3"]) assert.equal(parseVersion(text), undefined);
});

test("next patch and previews sit between the latest release and the next one", () => {
  assert.deepEqual(nextPatch(undefined), v("0.0.1"));
  assert.equal(previewVersion(v("1.2.3"), "stg", new Date("2026-11-23T05:06:07.890Z")), "1.2.4-stg.20261123050607");
});

test("environment follows the branch", () => {
  const branches = { production: "main", staging: "stg" };
  assert.deepEqual(
    ["main", "stg", "develop", "feature/x"].map((branch) => environmentOf(branch, branches)),
    ["prod", "stg", "dev", "dev"],
  );
});

test("the bot replaces only its own section and keeps what people wrote", () => {
  const first = withChanges("", "* PR #1");
  assert.equal(authoredNotes(first), "");
  const edited = `Faster sync.\n\n${first}\nThanks to everyone.`;
  const updated = withChanges(edited, "* PR #1\n* PR #2");
  assert.match(updated, /Faster sync\./);
  assert.match(updated, /Thanks to everyone\./);
  assert.match(updated, /\* PR #2/);
  assert.doesNotMatch(updated, /\* PR #1\n<!--/);
  assert.equal(withChanges(updated, "* PR #1\n* PR #2"), updated);
});

test("a release needs a new version and notes written by a person", () => {
  const latest = v("1.2.3");
  const notes = withChanges("Faster sync.", "* PR #1");
  assert.deepEqual(checkRelease({ title: "1.3.0", body: notes }, latest, undefined), { ok: true, version: v("1.3.0") });

  const problemsOf = (title: string, body: string, tagSha?: string, sha?: string) => {
    const result = checkRelease({ title, body }, latest, tagSha, sha);
    return result.ok ? [] : result.problems;
  };
  assert.equal(problemsOf("v1.3.0", notes).length, 1, "title with v");
  assert.equal(problemsOf("1.2.3", notes).length, 1, "same as latest");
  assert.equal(problemsOf("1.3.0", withChanges("", "* PR #1")).length, 1, "only the bot section");
  assert.equal(problemsOf("1.3.0", notes, "abc").length, 1, "tag taken before merge");
  assert.equal(problemsOf("1.3.0", notes, "abc", "def").length, 1, "tag on another commit");
  assert.equal(problemsOf("1.2.3", notes, "abc", "abc").length, 0, "re-run of the same release");
});
