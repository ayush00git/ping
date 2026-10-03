// Reads a GitHub link pasted into the search box. Pure: no I/O.

export type GitHubInput =
  | { kind: "user"; login: string; repo?: string }
  | { kind: "not-user"; reason: string };

// GitHub logins: 1–39 letters, digits or single hyphens, not starting or ending with a hyphen.
const LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
const REPO = /^[\w.-]{1,100}$/;

// First path segments on github.com that are site pages, not people.
const RESERVED = new Set([
  "about", "apps", "codespaces", "collections", "copilot", "enterprise", "events", "explore",
  "features", "issues", "login", "marketplace", "new", "notifications", "pricing", "pulls",
  "search", "settings", "signup", "sponsors", "topics", "trending",
]);

const NOT_A_PROFILE = "That GitHub link isn't a person's profile.";

const user = (login: string, repo?: string): GitHubInput | null => {
  if (!LOGIN.test(login)) return null;
  const r = repo?.replace(/\.git$/i, "");
  return r && REPO.test(r) ? { kind: "user", login, repo: r } : { kind: "user", login };
};

/**
 * Returns the username from a GitHub link, a reason when the link isn't a person's profile, or null
 * when the input isn't a GitHub link at all (callers then treat it as a username).
 */
export function parseGitHubInput(input: string): GitHubInput | null {
  let s = input.trim();
  if (!s) return null;

  // SSH remotes: git@github.com:login/repo.git
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)\/?$/i.exec(s);
  if (ssh) return user(ssh[1], ssh[2]) ?? { kind: "not-user", reason: NOT_A_PROFILE };

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean).map(safeDecode);

  // Personal sites: login.github.io/anything
  const pages = /^([^.]+)\.github\.io$/.exec(host);
  if (pages) return user(pages[1]) ?? { kind: "not-user", reason: NOT_A_PROFILE };

  if (host === "gist.github.com" || host === "raw.githubusercontent.com") {
    return (parts[0] && user(parts[0], host === "raw.githubusercontent.com" ? parts[1] : undefined)) || {
      kind: "not-user",
      reason: NOT_A_PROFILE,
    };
  }

  if (host === "api.github.com") {
    if ((parts[0] === "users" || parts[0] === "repos") && parts[1]) {
      return user(parts[1], parts[0] === "repos" ? parts[2] : undefined) ?? { kind: "not-user", reason: NOT_A_PROFILE };
    }
    return { kind: "not-user", reason: NOT_A_PROFILE };
  }

  if (host !== "github.com") return null;

  const [first, second] = parts;
  if (!first) return { kind: "not-user", reason: "That's GitHub's home page, not a person's profile." };
  const lower = first.toLowerCase();
  if (lower === "orgs") return { kind: "not-user", reason: "That's an organisation page, not a person's profile." };
  if (lower === "sponsors") {
    return (second && user(second)) || { kind: "not-user", reason: NOT_A_PROFILE };
  }
  if (RESERVED.has(lower)) return { kind: "not-user", reason: NOT_A_PROFILE };
  // github.com/login, /login/repo, and anything deeper (commit, tree, blob, pull…).
  return user(first, second) ?? { kind: "not-user", reason: NOT_A_PROFILE };
}

function safeDecode(part: string) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
