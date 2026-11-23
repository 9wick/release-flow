export type PullRequestEvent = {
  readonly action: string;
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly baseBranch: string;
  readonly headBranch: string;
  readonly headSha: string;
  readonly mergeSha: string | undefined;
};

type RawPullRequestEvent = {
  action?: string;
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    merged?: boolean;
    merge_commit_sha: string | null;
    base: { ref: string };
    head: { ref: string; sha: string };
  };
};

export const pullRequestOf = (event: unknown): PullRequestEvent | undefined => {
  const { action, pull_request: pr } = event as RawPullRequestEvent;
  if (!pr) return undefined;
  return {
    action: action ?? "",
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    baseBranch: pr.base.ref,
    headBranch: pr.head.ref,
    headSha: pr.head.sha,
    mergeSha: pr.merged && pr.merge_commit_sha ? pr.merge_commit_sha : undefined,
  };
};
