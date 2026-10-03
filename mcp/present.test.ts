import { test } from "node:test";
import assert from "node:assert/strict";
import { GitHubError, NetworkError, type GitHubUser, type Repo } from "@/lib/github";
import type { EmailCandidate } from "@/lib/emails";
import type { Hints, Tier } from "@/lib/linkedin";
import type { FindResult, Found } from "@/lib/resolve";
import { LimitReached } from "./budget.ts";
import { errorText, formatFind, formatLookup, linkedInProblem, notAUsername, parseUsername } from "./present.ts";

const repo: Repo = {
  name: "r",
  full_name: "u/r",
  html_url: "https://github.com/u/r",
  description: null,
  language: null,
  stargazers_count: 0,
  default_branch: "main",
  fork: false,
  created_at: "2026-01-15T12:00:00Z",
  owner: { login: "u", avatar_url: "" },
};
const candidate = (email: string, kind: EmailCandidate["kind"], extra: Partial<EmailCandidate> = {}): EmailCandidate => ({
  email,
  name: "U Ser",
  kind,
  isUser: true,
  source: "commit",
  commits: 3,
  lastSeen: "2026-02-01T12:00:00Z",
  sha: "abc",
  patchUrl: "https://github.com/u/r/commit/abc.patch",
  ...extra,
});
const user = (login: string): GitHubUser => ({
  login,
  type: "User",
  name: "Jane Doe",
  company: null,
  location: null,
  bio: null,
  blog: null,
  followers: 0,
  avatar_url: "",
  html_url: `https://github.com/${login}`,
});
const found = (login: string, tier: Tier): Found => ({
  tier,
  user: user(login),
  source: "name",
  evidence: [{ text: "Name matches: Jane Doe", tone: "for" }],
  warning: tier === "possible" ? "Only the name matches. Check their profile before choosing." : null,
});
const result = (f: Found[]): FindResult => ({
  found: f,
  checked: { link: 0, name: f.length, guess: 0 },
  nameTotal: f.length,
  detailsNeeded: 1,
  skipped: [],
  requests: 4,
});
const hints: Hints = { name: "Jane Doe", company: "", city: "", school: "" };

// Input
test("parseUsername: plain, @, and github.com URLs", () => {
  for (const input of ["vihar", "@vihar", " github.com/vihar ", "https://github.com/vihar/", "https://www.github.com/vihar/appsmith-strapi"]) {
    assert.equal(parseUsername(input), "vihar", input);
  }
  assert.equal(parseUsername("not a user"), null);
  assert.equal(parseUsername("linkedin.com/in/jane-doe"), null);
});
test("a LinkedIn URL points to the finder", () => {
  assert.match(notAUsername("linkedin.com/in/jane-doe"), /find_github_from_linkedin/);
  assert.equal(linkedInProblem({ kind: "not-profile", page: "company" }), "That's a company page. Pass a person's profile URL, linkedin.com/in/…");
});

// lookup_emails
test("no repositories of their own", () => {
  assert.match(formatLookup({ login: "u", repo: null, candidates: [], scanned: 0 }), /has no public repositories of their own/);
});
test("no commits by the user in the repo", () => {
  assert.match(formatLookup({ login: "u", repo, candidates: [], scanned: 0 }), /GitHub has no commits by @u in r/);
});
test("usable and unusable addresses, with the reason and how to add", () => {
  const text = formatLookup({
    login: "u",
    repo,
    scanned: 3,
    candidates: [candidate("u@example.com", "personal"), candidate("1+u@users.noreply.github.com", "noreply")],
  });
  assert.match(text, /Can receive mail · 1\n- u@example.com · U Ser · 3 commits, last Feb 1, 2026 · https:\/\/github.com\/u\/r\/commit\/abc.patch/);
  assert.match(text, /Can't receive mail · 1\n- 1\+u@users.noreply.github.com .* Private: GitHub noreply, can't receive mail/);
  assert.match(text, /call add_to_list with username "u"/);
});
test("only GitHub's noreply address", () => {
  const text = formatLookup({ login: "u", repo, scanned: 1, candidates: [candidate("1+u@users.noreply.github.com", "noreply")] });
  assert.match(text, /No public email\. @u commits with GitHub's private noreply address\./);
  assert.doesNotMatch(text, /add_to_list/);
});

// find_github_from_linkedin
test("one confirmed account is the best match", () => {
  const text = formatFind("jane-doe", hints, "Jane Doe", result([found("jane", "confirmed"), found("jd", "possible")]));
  assert.match(text, /Name read from the URL: Jane Doe/);
  assert.match(text, /Checked 2 accounts: 2 from a name search\. Showing 2\./);
  assert.match(text, /- @jane · Jane Doe · https:\/\/github.com\/jane · best match\n  ✓ Name matches: Jane Doe/);
  assert.match(text, /Possible · 1: Only the name matches\.[\s\S]*Only the name matches\. Check their profile before choosing\./);
  assert.match(text, /Don't choose for the user/);
});
test("a tie gets no best match", () => {
  const text = formatFind("jane-doe", hints, "Jane Doe", result([found("jane", "likely"), found("jd", "likely")]));
  assert.match(text, /2 accounts match equally\. Compare them before choosing\./);
  assert.doesNotMatch(text, /best match/);
});
test("only ruled-out accounts", () => {
  const text = formatFind("jane-doe", hints, "Jane Doe", result([found("jane", "ruled-out")]));
  assert.match(text, /No GitHub account found\.\nThe only matches link to a different LinkedIn profile/);
  assert.match(text, /Ruled out · 1/);
  assert.doesNotMatch(text, /Don't choose/);
});

// Errors
test("errors in the web app's words", () => {
  assert.equal(errorText(new GitHubError("Not Found", 404), { username: "nobody" }), "No GitHub user named @nobody. Check the spelling and try again.");
  assert.match(
    errorText(new GitHubError("limit", 403, true, new Date(Date.now() + 5 * 60000)), { username: "u" }),
    /^GitHub's rate limit is reached\. Lookups work again at .* \(in about 5 minutes\)\./,
  );
  assert.match(errorText(new GitHubError("limit", 429, true), { username: "u" }), /Try again in a few minutes\./);
  assert.equal(errorText(new GitHubError("Server Error", 500), { username: "u" }), "GitHub returned an error: Server Error (HTTP 500).");
  assert.match(errorText(new NetworkError("x"), { username: "u" }), /^Couldn't reach GitHub\./);
  assert.match(errorText(new LimitReached("lookups", 30, new Date(Date.now() + 60000)), { username: "u" }), /allows 30 lookups an hour/);
});
