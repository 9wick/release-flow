import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("..", import.meta.url);
const readmes = ["README.md", "README.ja.md"];

for (const readmePath of readmes) {
  const readme = readFileSync(new URL(readmePath, root), "utf8");

  test(`${readmePath} quickstart shows each example workflow as it is`, () => {
    for (const name of readdirSync(new URL("examples/", root))) {
      const workflow = readFileSync(new URL(`examples/${name}`, root), "utf8");
      assert.ok(
        readme.includes(`\`\`\`yaml\n# .github/workflows/${name}\n${workflow}\`\`\``),
        `${name} differs from ${readmePath}`,
      );
    }
  });
}
