import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

type Route = (body: any) => [status: number, json: unknown];
type Call = { route: string; body: any };

const root = new URL("..", import.meta.url).pathname;

// Runs an action entrypoint the way the runner does: inputs and context in env, outputs in a file.
const runAction = async (
  action: string,
  routes: Record<string, Route>,
  github: { eventName: string; event: unknown; ref: string; sha: string },
  inputs: Record<string, string> = {},
) => {
  const calls: Call[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const path = new URL(req.url!, "http://x").pathname.replace("/repos/acme/app/", "");
    const route = `${req.method} ${decodeURIComponent(path)}`;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ route, body });
    const [status, json] = routes[route]?.(body) ?? [500, { message: `unexpected ${route}` }];
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(json));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  await mkdir(join(root, ".tmp"), { recursive: true });
  const dir = await mkdtemp(join(root, ".tmp", "action-"));
  try {
    await writeFile(join(dir, "event.json"), JSON.stringify(github.event));
    await writeFile(join(dir, "output"), "");
    const { port } = server.address() as AddressInfo;
    const result = await promisify(execFile)(process.execPath, [join(root, action, "main.ts")], {
      env: {
        PATH: process.env.PATH,
        "INPUT_TOKEN": "t",
        "INPUT_PRODUCTION-BRANCH": "main",
        "INPUT_STAGING-BRANCH": "stg",
        "INPUT_TAG-PREFIX": "v",
        "INPUT_DRAFT": "true",
        "INPUT_STAGING-PRERELEASE": "stg",
        "INPUT_DEVELOPMENT-PRERELEASE": "dev",
        ...inputs,
        GITHUB_API_URL: `http://127.0.0.1:${port}`,
        GITHUB_REPOSITORY: "acme/app",
        GITHUB_EVENT_NAME: github.eventName,
        GITHUB_EVENT_PATH: join(dir, "event.json"),
        GITHUB_REF_NAME: github.ref,
        GITHUB_SHA: github.sha,
        GITHUB_OUTPUT: join(dir, "output"),
      },
    }).then(
      ({ stdout }) => ({ ok: true, stdout }),
      (error: { stdout: string }) => ({ ok: false, stdout: error.stdout }),
    );
    const outputs = Object.fromEntries(
      [...(await readFile(join(dir, "output"), "utf8")).matchAll(/^([\w-]+)<<(\S+)\n([\s\S]*?)\n\2$/gm)].map(
        ([, name, , value]) => [name, value],
      ),
    );
    return { ...result, outputs, calls };
  } finally {
    server.close();
    await rm(dir, { recursive: true });
  }
};

const tags = (...names: string[]): Route => () => [200, names.map((name) => ({ ref: `refs/tags/${name}` }))];
const pr = (fields: object) => ({ number: 7, title: "1.2.4", body: "", html_url: "https://x/pull/7", base: { ref: "main" }, ...fields });
const push = (ref: string, sha: string) => ({ eventName: "push", event: {}, ref, sha });

test("release-pr opens a draft titled with the next patch and lists the shipped PRs", async () => {
  let body = "";
  const result = await runAction(
    "release-pr",
    {
      "GET compare/main...stg": () => [200, { ahead_by: 2 }],
      "GET git/matching-refs/tags/v": tags("v1.2.3", "v1.2.4-stg.1"),
      "GET pulls": () => [200, []],
      "POST pulls": (req) => ((body = req.body), [201, pr({ title: req.title, body })]),
      "POST releases/generate-notes": () => [200, { body: "* Faster sync by @a in #5" }],
      "GET pulls/7": () => [200, pr({ body })],
      "PATCH pulls/7": (req) => ((body = req.body), [200, pr({ body })]),
    },
    push("stg", "s1"),
  );
  assert.ok(result.ok, result.stdout);
  const created = result.calls.find((call) => call.route === "POST pulls")!.body;
  assert.deepEqual(
    { base: created.base, head: created.head, title: created.title, draft: created.draft },
    { base: "main", head: "stg", title: "1.2.4", draft: true },
  );
  const notes = result.calls.find((call) => call.route === "POST releases/generate-notes")!.body;
  assert.deepEqual(notes, { tag_name: "v1.2.4", target_commitish: "stg", previous_tag_name: "v1.2.3" });
  assert.match(created.body, /^<!-- release-flow:notes -->/);
  assert.equal(body, `${created.body}\n<!-- release-flow:changes -->\n* Faster sync by @a in #5\n<!-- /release-flow:changes -->\n`);
  assert.deepEqual(result.outputs, { "pull-request-number": "7", "pull-request-url": "https://x/pull/7", created: "true" });
});

test("release-pr keeps the existing PR's title and the description people wrote", async () => {
  let body =
    "<!-- release-flow:notes -->\nFaster sync.\n<!-- /release-flow:notes -->\n\n<!-- release-flow:changes -->\nold\n<!-- /release-flow:changes -->\n";
  const result = await runAction(
    "release-pr",
    {
      "GET compare/main...stg": () => [200, { ahead_by: 1 }],
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "GET pulls": () => [200, [pr({ title: "1.3.0", body })]],
      "POST releases/generate-notes": () => [200, { body: "new" }],
      "GET pulls/7": () => [200, pr({ title: "1.3.0", body })],
      "PATCH pulls/7": (req) => ((body = req.body), [200, pr({ body })]),
    },
    push("stg", "s1"),
  );
  assert.ok(result.ok, result.stdout);
  assert.equal(result.calls.find((call) => call.route === "POST releases/generate-notes")!.body.tag_name, "v1.3.0");
  assert.equal(
    body,
    "<!-- release-flow:notes -->\nFaster sync.\n<!-- /release-flow:notes -->\n\n<!-- release-flow:changes -->\nnew\n<!-- /release-flow:changes -->\n",
  );
  assert.equal(result.outputs.created, "false");
});

test("release-pr does nothing when staging has nothing new", async () => {
  const result = await runAction("release-pr", { "GET compare/main...stg": () => [200, { ahead_by: 0 }] }, push("stg", "s1"));
  assert.ok(result.ok, result.stdout);
  assert.deepEqual(result.calls.map((call) => call.route), ["GET compare/main...stg"]);
});

const hotfixEvent = (action: string, title: string, body: string) => ({
  eventName: "pull_request",
  event: { action, pull_request: { number: 9, title, body, base: { ref: "main" }, head: { ref: "hotfix/crash", sha: "h1" }, merge_commit_sha: null } },
  ref: "9/merge",
  sha: "m1",
});

test("check rejects a hotfix PR whose version is already released", async () => {
  const body = "<!-- release-flow:notes -->\nFix crash\n<!-- /release-flow:notes -->\n";
  const result = await runAction(
    "check",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "GET commits/refs/tags/v1.2.3": () => [200, { sha: "old" }],
    },
    hotfixEvent("edited", "1.2.3", body),
  );
  assert.equal(result.ok, false);
  assert.match(result.stdout, /::error::1\.2\.3 is already released at old\. Use a newer version such as 1\.2\.4\./);
  assert.ok(!result.calls.some((call) => call.route.endsWith("pulls/9")), "a body with the section is left alone");
});

test("check fills in the version and notes section when a hand-made PR opens", async () => {
  const written = "Crash on launch when offline. Edited after the event fired.";
  const result = await runAction(
    "check",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "GET pulls/9": () => [200, pr({ number: 9, title: "Fix crash", body: written })],
      "PATCH pulls/9": (req) => [200, pr({ number: 9, ...req })],
      "GET commits/refs/tags/v1.2.4": () => [404, { message: "Not Found" }],
    },
    hotfixEvent("opened", "Fix crash", "Crash on launch."),
  );
  assert.equal(result.ok, false);
  assert.match(result.stdout, /::error::PR description must contain the release notes/);
  assert.doesNotMatch(result.stdout, /PR title must be/, "the filled-in version is what gets checked");
  assert.deepEqual(result.calls.find((call) => call.route === "PATCH pulls/9")!.body, {
    title: "1.2.4",
    body: `${written}\n\n<!-- release-flow:notes -->\n<!-- Write the release notes for users here. -->\n<!-- /release-flow:notes -->\n`,
  });
});

test("check only reports problems on later edits", async () => {
  const result = await runAction(
    "check",
    { "GET git/matching-refs/tags/v": tags("v1.2.3") },
    hotfixEvent("edited", "Fix crash", "Crash on launch."),
  );
  assert.equal(result.ok, false);
  assert.match(result.stdout, /::error::PR title must be a release version such as 1\.2\.4/);
  assert.match(result.stdout, /::error::PR description must contain the release notes/);
  assert.ok(!result.calls.some((call) => call.route.endsWith("pulls/9")), "the PR is not touched");
});

test("resolve on a push to main takes the version and notes from the merged PR", async () => {
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "GET commits/m1/pulls": () => [
        200,
        [
          pr({
            title: "1.3.0",
            body: "Reviewer memo.\n\n<!-- release-flow:notes -->\nFaster sync.\n<!-- /release-flow:notes -->\n\n<!-- release-flow:changes -->\n* Sync by @a in #5\n<!-- /release-flow:changes -->\n",
            merged_at: "2026-11-23T00:00:00Z",
          }),
        ],
      ],
      "GET commits/refs/tags/v1.3.0": () => [404, { message: "Not Found" }],
    },
    push("main", "m1"),
  );
  assert.ok(result.ok, result.stdout);
  assert.deepEqual(result.outputs, {
    environment: "prod",
    version: "1.3.0",
    tag: "v1.3.0",
    notes: "Faster sync.",
    sha: "m1",
    "pull-request-number": "7",
  });
});

test("resolve on a merged PR event uses the merge commit", async () => {
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "GET commits/refs/tags/v1.3.0": () => [200, { sha: "m1" }],
    },
    {
      eventName: "pull_request",
      event: { pull_request: { number: 7, title: "1.3.0", body: "<!-- release-flow:notes -->\nFaster sync.\n<!-- /release-flow:notes -->", merged: true, merge_commit_sha: "m1", base: { ref: "main" }, head: { ref: "stg", sha: "s1" } } },
      ref: "7/merge",
      sha: "x",
    },
  );
  assert.ok(result.ok, result.stdout);
  assert.equal(result.outputs.sha, "m1");
  assert.equal(result.outputs.version, "1.3.0");
});

test("resolve refuses a direct push to main", async () => {
  const result = await runAction(
    "resolve",
    { "GET git/matching-refs/tags/v": tags("v1.2.3"), "GET commits/m1/pulls": () => [200, []] },
    push("main", "m1"),
  );
  assert.equal(result.ok, false);
  assert.match(result.stdout, /did not come from a merged PR/);
});

test("resolve on other branches gives a preview version", async () => {
  const result = await runAction("resolve", { "GET git/matching-refs/tags/v": tags("v1.2.3") }, push("develop", "d1"));
  assert.ok(result.ok, result.stdout);
  assert.equal(result.outputs.environment, "dev");
  assert.match(result.outputs.version!, /^1\.2\.4-dev\.\d{14}$/);
  assert.equal(result.outputs.sha, "d1");
});

test("resolve on staging tags the next number for the upcoming version", async () => {
  const taken = new Set(["v1.2.4-stg.2"]);
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3", "v1.2.3-stg.5", "v1.2.4-stg.0", "v1.2.4-stg.1", "v1.2.4-stg.x"),
      "GET commits/refs/tags/v1.2.4-stg.1": () => [200, { sha: "older" }],
      // Another run tagged stg.2 after this one listed the tags.
      "POST git/refs": (req) =>
        taken.has(req.ref.replace("refs/tags/", ""))
          ? [422, { message: "Reference already exists" }]
          : [201, { ref: req.ref }],
    },
    push("stg", "s1"),
  );
  assert.ok(result.ok, result.stdout);
  assert.deepEqual(
    result.calls.filter((call) => call.route === "POST git/refs").map((call) => call.body),
    [
      { ref: "refs/tags/v1.2.4-stg.2", sha: "s1" },
      { ref: "refs/tags/v1.2.4-stg.3", sha: "s1" },
    ],
  );
  assert.deepEqual(result.outputs, {
    environment: "stg",
    version: "1.2.4-stg.3",
    tag: "v1.2.4-stg.3",
    notes: "",
    sha: "s1",
    "pull-request-number": "",
  });
});

test("resolve on staging starts at 0 after a release", async () => {
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3", "v1.2.3-stg.4"),
      "POST git/refs": (req) => [201, { ref: req.ref }],
    },
    push("stg", "s1"),
  );
  assert.ok(result.ok, result.stdout);
  assert.equal(result.outputs.version, "1.2.4-stg.0");
});

test("resolve on staging reuses the tag when rerun for the same commit", async () => {
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3", "v1.2.4-stg.0"),
      "GET commits/refs/tags/v1.2.4-stg.0": () => [200, { sha: "s1" }],
    },
    push("stg", "s1"),
  );
  assert.ok(result.ok, result.stdout);
  assert.equal(result.outputs.version, "1.2.4-stg.0");
  assert.ok(!result.calls.some((call) => call.route === "POST git/refs"), "no new tag");
});

test("resolve on staging fails when the tag cannot be created", async () => {
  const result = await runAction(
    "resolve",
    {
      "GET git/matching-refs/tags/v": tags("v1.2.3"),
      "POST git/refs": () => [403, { message: "Resource not accessible by integration" }],
    },
    push("stg", "s1"),
  );
  assert.equal(result.ok, false);
  assert.match(result.stdout, /::error::POST git\/refs for v1\.2\.4-stg\.0 failed: 403/);
});

test("resolve uses the configured pre-release labels", async () => {
  const routes = {
    "GET git/matching-refs/tags/v": tags("v1.2.3", "v1.2.4-stg.4", "v1.2.4-beta.0"),
    "GET commits/refs/tags/v1.2.4-beta.0": () => [200, { sha: "older" }] as [number, unknown],
    "POST git/refs": (req: any) => [201, { ref: req.ref }] as [number, unknown],
  };
  const labels = { "INPUT_STAGING-PRERELEASE": "beta", "INPUT_DEVELOPMENT-PRERELEASE": "alpha" };
  const staging = await runAction("resolve", routes, push("stg", "s1"), labels);
  assert.ok(staging.ok, staging.stdout);
  assert.deepEqual([staging.outputs.environment, staging.outputs.version], ["stg", "1.2.4-beta.1"]);
  const dev = await runAction("resolve", routes, push("develop", "d1"), labels);
  assert.ok(dev.ok, dev.stdout);
  assert.equal(dev.outputs.environment, "dev");
  assert.match(dev.outputs.version!, /^1\.2\.4-alpha\.\d{14}$/);
});

test("resolve rejects a label that is not a pre-release identifier", async () => {
  const result = await runAction("resolve", {}, push("stg", "s1"), { "INPUT_STAGING-PRERELEASE": "beta.1" });
  assert.equal(result.ok, false);
  assert.match(result.stdout, /::error::"beta\.1" is not a pre-release label/);
  assert.deepEqual(result.calls, [], "nothing is tagged");
});
