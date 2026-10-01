import "server-only";

export { patchUrl } from "@/lib/emails";

const API = "https://api.github.com";
export const PER_PAGE = 30;
export const AUTHOR_COMMITS_LIMIT = 100;

export type Repo = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  default_branch: string;
  fork: boolean;
  created_at: string;
  owner: { login: string; avatar_url: string };
};

type GitIdentity = { name: string; email: string; date: string };

export type Commit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: GitIdentity | null;
    committer: GitIdentity | null;
  };
  author: { login: string; avatar_url: string } | null;
};

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
    public rateLimited = false,
    /** When a rate-limited request may be retried, if GitHub said. */
    public resetAt: Date | null = null,
  ) {
    super(message);
    this.minutesToReset = resetAt ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 60000)) : null;
  }

  readonly minutesToReset: number | null;
}

/** fetch() itself failed: DNS, offline, connection reset. Not an HTTP error. */
export class NetworkError extends Error {}

export const hasToken = () => !!process.env.GITHUB_TOKEN;

async function gh<T>(path: string, accept = "application/vnd.github+json"): Promise<T> {
  const headers: HeadersInit = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  // Optional: raises the rate limit from 60 to 5000 requests/hour.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let res: Response;
  try {
    res = await fetch(API + path, { headers, next: { revalidate: 60 } });
  } catch (cause) {
    throw new NetworkError("Couldn't reach GitHub", { cause });
  }
  if (res.ok) return res.json() as Promise<T>;

  // Primary limit: remaining=0 with a reset timestamp. Secondary limit: 403 with retry-after seconds.
  const retryAfter = Number(res.headers.get("retry-after"));
  const limited =
    res.status === 429 ||
    (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || retryAfter > 0));
  if (limited) {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const resetAt =
      retryAfter > 0 ? new Date(Date.now() + retryAfter * 1000) : reset > 0 ? new Date(reset * 1000) : null;
    throw new GitHubError("GitHub rate limit reached.", res.status, true, resetAt);
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  throw new GitHubError(body.message ?? `Request failed (${res.status})`, res.status);
}

// GitHub answers 409 Conflict for a repository with no commits.
async function commitsOrEmpty(path: string): Promise<Commit[]> {
  try {
    return await gh<Commit[]>(path);
  } catch (e) {
    if (e instanceof GitHubError && e.status === 409) return [];
    throw e;
  }
}

export async function getLatestRepo(username: string): Promise<Repo | null> {
  // The API can't exclude forks, so fetch a page and take the newest repo that isn't one.
  const repos = await gh<Repo[]>(
    `/users/${encodeURIComponent(username)}/repos?type=owner&sort=created&direction=desc&per_page=100`,
  );
  return repos.find((r) => !r.fork) ?? null;
}

export function getCommits(fullName: string, page: number): Promise<Commit[]> {
  return commitsOrEmpty(`/repos/${fullName}/commits?per_page=${PER_PAGE}&page=${page}`);
}

/** The user's own recent commits, independent of which log page is open. */
export function getAuthorCommits(fullName: string, username: string): Promise<Commit[]> {
  return commitsOrEmpty(
    `/repos/${fullName}/commits?author=${encodeURIComponent(username)}&per_page=${AUTHOR_COMMITS_LIMIT}`,
  );
}

// ---- Finder (LinkedIn → GitHub account) ----

export type GitHubUser = {
  login: string;
  type: "User" | "Organization";
  name: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
  blog: string | null;
  followers: number;
  avatar_url: string;
  html_url: string;
};

export function getUser(login: string): Promise<GitHubUser> {
  return gh<GitHubUser>(`/users/${encodeURIComponent(login)}`);
}

export async function getSocialUrls(login: string): Promise<string[]> {
  const accounts = await gh<{ provider: string; url: string }[]>(
    `/users/${encodeURIComponent(login)}/social_accounts`,
  );
  return accounts.map((a) => a.url);
}

/** Name search. The name must stay unquoted (quoted returns nothing); a multi-word city must be quoted. */
export async function searchUsersByName(
  name: string,
  city?: string,
): Promise<{ total: number; logins: string[] }> {
  const q = `fullname:${name} type:user${city ? ` location:"${city.replace(/"/g, "")}"` : ""}`;
  const res = await gh<{ total_count: number; items: { login: string }[] }>(
    `/search/users?q=${encodeURIComponent(q)}&per_page=10`,
  );
  return { total: res.total_count, logins: res.items.map((i) => i.login) };
}

export type CodeHit = {
  owner: string;
  ownerType: "User" | "Organization";
  repo: string;
  path: string;
  fragments: string[];
};

/** Code search for the profile URL. Needs a token; allows 10 searches a minute. */
export async function searchCodeForLinkedIn(slug: string): Promise<CodeHit[]> {
  const res = await gh<{
    items: {
      path: string;
      repository: { name: string; owner: { login: string; type: "User" | "Organization" } };
      text_matches?: { fragment: string }[];
    }[];
  }>(
    `/search/code?q=${encodeURIComponent(`"linkedin.com/in/${slug}"`)}&per_page=30`,
    "application/vnd.github.text-match+json",
  );
  return res.items.map((i) => ({
    owner: i.repository.owner.login,
    ownerType: i.repository.owner.type,
    repo: i.repository.name,
    path: i.path,
    fragments: (i.text_matches ?? []).map((m) => m.fragment),
  }));
}
