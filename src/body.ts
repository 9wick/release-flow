// The bot owns only the text between these markers; everything else in the PR body is the human's.
const start = "<!-- release-flow:changes -->";
const end = "<!-- /release-flow:changes -->";
const block = new RegExp(`\\n*${start}[\\s\\S]*?${end}\\n*`);

export const withChanges = (body: string, changes: string): string => {
  const section = `${start}\n${changes.trim()}\n${end}`;
  const authored = authoredNotes(body);
  return authored === "" ? `${section}\n` : `${authored}\n\n${section}\n`;
};

export const authoredNotes = (body: string): string => body.replace(block, "\n").trim();
