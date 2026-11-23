export type PullRequest = {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
};

type RawPullRequest = {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  merged_at?: string | null;
  base: { ref: string };
};

const toPullRequest = (raw: RawPullRequest): PullRequest => ({
  number: raw.number,
  title: raw.title,
  body: raw.body ?? "",
  url: raw.html_url,
});

export type GitHubConfig = { readonly token: string; readonly apiUrl: string; readonly repository: string };

export type GitHub = ReturnType<typeof createGitHub>;

// API failures other than "not found" are unrecoverable for a release step, so they throw.
export const createGitHub = ({ token, apiUrl, repository }: GitHubConfig) => {
  const call = (method: string, path: string, body?: unknown): Promise<Response> =>
    fetch(`${apiUrl}/repos/${repository}/${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await call(method, path, body);
    if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  };

  const requestOptional = async <T>(path: string): Promise<T | undefined> => {
    const response = await call("GET", path);
    if (response.status === 404 || response.status === 422) return undefined;
    if (!response.ok) throw new Error(`GET ${path} failed: ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  };

  const tagsStartingWith = async (prefix: string): Promise<string[]> => {
    const tags: string[] = [];
    for (let page = 1; ; page++) {
      const refs = await request<{ ref: string }[]>(
        "GET",
        `git/matching-refs/tags/${encodeURIComponent(prefix)}?per_page=100&page=${page}`,
      );
      tags.push(...refs.map(({ ref }) => ref.replace(/^refs\/tags\//, "")));
      if (refs.length < 100) return tags;
    }
  };

  const tagCommit = async (tag: string): Promise<string | undefined> =>
    (await requestOptional<{ sha: string }>(`commits/${encodeURIComponent(`refs/tags/${tag}`)}`))?.sha;

  const aheadBy = async (base: string, head: string): Promise<number> =>
    (await request<{ ahead_by: number }>("GET", `compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`))
      .ahead_by;

  const openPullRequest = async (base: string, head: string): Promise<PullRequest | undefined> => {
    const owner = repository.split("/")[0];
    const query = new URLSearchParams({ state: "open", base, head: `${owner}:${head}` });
    const [found] = await request<RawPullRequest[]>("GET", `pulls?${query}`);
    return found && toPullRequest(found);
  };

  const getPullRequest = async (number: number): Promise<PullRequest> =>
    toPullRequest(await request<RawPullRequest>("GET", `pulls/${number}`));

  const createPullRequest = async (pr: {
    base: string;
    head: string;
    title: string;
    body: string;
    draft: boolean;
  }): Promise<PullRequest> => toPullRequest(await request<RawPullRequest>("POST", "pulls", pr));

  const updatePullRequest = async (number: number, fields: { title?: string; body?: string }): Promise<void> => {
    await request("PATCH", `pulls/${number}`, fields);
  };

  const mergedPullRequestOf = async (sha: string, base: string): Promise<PullRequest | undefined> => {
    const pulls = await request<RawPullRequest[]>("GET", `commits/${sha}/pulls`);
    const merged = pulls.find((pr) => pr.merged_at && pr.base.ref === base);
    return merged && toPullRequest(merged);
  };

  const generateNotes = async (notes: { tag: string; target: string; previousTag: string | undefined }) =>
    (
      await request<{ body: string }>("POST", "releases/generate-notes", {
        tag_name: notes.tag,
        target_commitish: notes.target,
        ...(notes.previousTag === undefined ? {} : { previous_tag_name: notes.previousTag }),
      })
    ).body;

  return {
    tagsStartingWith,
    tagCommit,
    aheadBy,
    openPullRequest,
    getPullRequest,
    createPullRequest,
    updatePullRequest,
    mergedPullRequestOf,
    generateNotes,
  };
};
