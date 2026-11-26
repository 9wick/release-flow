// A release PR body holds two marked sections. People write `notes`; the bot rewrites only `changes`.
// Anything outside them (PR templates, reviewer memos, other bots) never reaches the release.
export type Section = "notes" | "changes";

const start = (section: Section) => `<!-- release-flow:${section} -->`;
const end = (section: Section) => `<!-- /release-flow:${section} -->`;
const pattern = (section: Section) => new RegExp(`${start(section)}\\n?([\\s\\S]*?)\\n?${end(section)}`);

export const readSection = (body: string, section: Section): string | undefined =>
  pattern(section).exec(body)?.[1];

const sectionBlock = (section: Section, content: string) => `${start(section)}\n${content.trim()}\n${end(section)}`;

const append = (body: string, text: string): string => {
  const rest = body.trimEnd();
  return rest === "" ? `${text}\n` : `${rest}\n\n${text}\n`;
};

export const writeSection = (body: string, section: Section, content: string): string => {
  const block = sectionBlock(section, content);
  return pattern(section).test(body) ? body.replace(pattern(section), () => block) : append(body, block);
};

// Markers are invisible in the rendered PR, so a visible heading tells people where to write.
// It sits outside the markers to stay out of the release, and is added only with a new section so it never repeats.
const notesHeading =
  "## Release Notes\n> Edit before merging. This section is copied to the GitHub Release when the PR is merged.";

export const withNotesSection = (body: string): string =>
  readSection(body, "notes") === undefined
    ? append(body, `${notesHeading}\n\n${sectionBlock("notes", "<!-- Write the release notes for users here. -->")}`)
    : body;

// HTML comments are the template's guidance, not part of the notes.
export const releaseNotes = (body: string): string =>
  (readSection(body, "notes") ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
