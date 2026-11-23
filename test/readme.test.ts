import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const readme = readFileSync(new URL("README.md", root), "utf8");

test("the README quickstart shows each example workflow as it is", () => {
  for (const name of readdirSync(new URL("examples/", root))) {
    const workflow = readFileSync(new URL(`examples/${name}`, root), "utf8");
    assert.ok(readme.includes(`\`\`\`yaml\n# .github/workflows/${name}\n${workflow}\`\`\``), `${name} differs from the README`);
  }
});
