import { getAuthorCommits, getLatestRepo, type Repo } from "@/lib/github";
import { collectCandidates, type EmailCandidate } from "@/lib/emails";

export type Lookup = {
  login: string; // as GitHub spells it, once a repo is found
  repo: Repo | null; // null: no public repositories of their own
  candidates: EmailCandidate[];
  scanned: number; // the user's own commits read
};

// The web app caches GitHub responses for 60 s (`revalidate: 60`), which plain Node ignores.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: Promise<Lookup> }>();

/**
 * The web app's lookup (components/results.tsx): the most recently created repo that isn't a fork,
 * then the user's own commits in it. `onMiss` runs before going to GitHub, so a budget can stop it.
 */
export function lookup(username: string, onMiss: () => void = () => {}): Promise<Lookup> {
  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  onMiss();
  const result = fetchLookup(username);
  cache.set(key, { at: Date.now(), result });
  result.catch(() => {
    if (cache.get(key)?.result === result) cache.delete(key);
  });
  return result;
}

async function fetchLookup(username: string): Promise<Lookup> {
  const repo = await getLatestRepo(username);
  if (!repo) return { login: username, repo: null, candidates: [], scanned: 0 };
  const commits = await getAuthorCommits(repo.full_name, username);
  const login = repo.owner.login;
  return {
    login,
    repo,
    candidates: collectCandidates({ commits, username: login, fullName: repo.full_name }),
    scanned: commits.length,
  };
}
