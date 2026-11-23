import { appendFileSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Branches } from "./environment.ts";
import { createGitHub, type GitHub } from "./github.ts";

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} is not set; run this inside GitHub Actions.`);
  return value;
};

// The runner exposes `with:` values as INPUT_<NAME>, upper-cased with hyphens kept.
export const input = (name: string): string => env(`INPUT_${name.toUpperCase()}`).trim();

export const setOutputs = (outputs: Record<string, string>): void => {
  const file = env("GITHUB_OUTPUT");
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `EOF_${randomUUID()}`;
    appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
};

export type Context = {
  readonly github: GitHub;
  readonly branches: Branches;
  readonly tagPrefix: string;
  readonly eventName: string;
  readonly event: unknown;
  readonly ref: string;
  readonly sha: string;
};

export const context = (): Context => ({
  github: createGitHub({
    token: input("token"),
    apiUrl: env("GITHUB_API_URL"),
    repository: env("GITHUB_REPOSITORY"),
  }),
  branches: { production: input("production-branch"), staging: input("staging-branch") },
  tagPrefix: input("tag-prefix"),
  eventName: env("GITHUB_EVENT_NAME"),
  event: JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8")),
  ref: env("GITHUB_REF_NAME"),
  sha: env("GITHUB_SHA"),
});

export type Outcome = { readonly ok: true } | { readonly ok: false; readonly problems: readonly string[] };

export const run = (main: () => Promise<Outcome>): void => {
  main().then(
    (outcome) => {
      if (outcome.ok) return;
      for (const problem of outcome.problems) console.log(`::error::${problem}`);
      process.exitCode = 1;
    },
    (error: unknown) => {
      console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    },
  );
};
