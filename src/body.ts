// A release PR body holds two marked sections. People write `notes`; the bot rewrites only `changes`.
// Anything outside them (PR templates, reviewer memos, other bots) never reaches the release.
export type Section = "notes" | "changes";

const start = (section: Section) => `<!-- release-flow:${section} -->`;
const end = (section: Section) => `<!-- /release-flow:${section} -->`;
const pattern = (section: Section) => new RegExp(`${start(section)}\\n?([\\s\\S]*?)\\n?${end(section)}`);

export const readSection = (body: string, section: Section): string | undefined =>
  pattern(section).exec(body)?.[1];

export const writeSection = (body: string, section: Section, content: string): string => {
  const block = `${start(section)}\n${content.trim()}\n${end(section)}`;
  if (pattern(section).test(body)) return body.replace(pattern(section), () => block);
  const rest = body.trimEnd();
  return rest === "" ? `${block}\n` : `${rest}\n\n${block}\n`;
};

// Gives PRs that people open by hand, such as hotfixes, the same place to write as bot-made release PRs.
export const withNotesSection = (body: string): string =>
  readSection(body, "notes") === undefined
    ? writeSection(body, "notes", "<!-- Write the release notes for users here. -->")
    : body;

export const notesTemplate = withNotesSection("");

// HTML comments are the template's guidance, not part of the notes.
export const releaseNotes = (body: string): string =>
  (readSection(body, "notes") ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
