import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGitHubInput } from "./github-url.ts";

const user = (login: string, repo?: string) => (repo ? { kind: "user", login, repo } : { kind: "user", login });
const notUser = (input: string) => assert.equal(parseGitHubInput(input)?.kind, "not-user", input);

test("profile links give the username", () => {
  for (const input of [
    "https://github.com/gaearon",
    "http://github.com/gaearon/",
    "github.com/gaearon",
    "www.github.com/gaearon",
    "https://github.com/gaearon?tab=repositories",
    "https://github.com/gaearon#top",
    "  https://github.com/gaearon  ",
  ]) {
    assert.deepEqual(parseGitHubInput(input), user("gaearon"), input);
  }
});

test("repo links and anything deeper give the username and repo", () => {
  assert.deepEqual(parseGitHubInput("github.com/gaearon/overreacted.io"), user("gaearon", "overreacted.io"));
  assert.deepEqual(parseGitHubInput("https://github.com/gaearon/react-hot-loader/commit/abc1234"), user("gaearon", "react-hot-loader"));
  assert.deepEqual(parseGitHubInput("https://github.com/gaearon/redux/tree/main/src"), user("gaearon", "redux"));
  assert.deepEqual(parseGitHubInput("https://github.com/gaearon/redux/blob/main/README.md"), user("gaearon", "redux"));
  assert.deepEqual(parseGitHubInput("https://github.com/gaearon/redux/pull/12"), user("gaearon", "redux"));
  assert.deepEqual(parseGitHubInput("https://github.com/gaearon/redux.git"), user("gaearon", "redux"));
});

test("git remotes", () => {
  assert.deepEqual(parseGitHubInput("git@github.com:gaearon/overreacted.io.git"), user("gaearon", "overreacted.io"));
  assert.deepEqual(parseGitHubInput("ssh://git@github.com/gaearon/redux.git"), user("gaearon", "redux"));
});

test("other GitHub hosts", () => {
  assert.deepEqual(parseGitHubInput("gaearon.github.io"), user("gaearon"));
  assert.deepEqual(parseGitHubInput("https://gaearon.github.io/some/post/"), user("gaearon"));
  assert.deepEqual(parseGitHubInput("https://gist.github.com/gaearon/5d9a3b1c"), user("gaearon"));
  assert.deepEqual(parseGitHubInput("https://raw.githubusercontent.com/gaearon/redux/main/README.md"), user("gaearon", "redux"));
  assert.deepEqual(parseGitHubInput("https://api.github.com/users/gaearon"), user("gaearon"));
  assert.deepEqual(parseGitHubInput("https://api.github.com/repos/gaearon/redux"), user("gaearon", "redux"));
  assert.deepEqual(parseGitHubInput("github.com/sponsors/gaearon"), user("gaearon"));
});

test("keeps the login's case", () => {
  assert.deepEqual(parseGitHubInput("github.com/Ayush00Git"), user("Ayush00Git"));
});

test("site pages and organisations aren't people", () => {
  for (const input of [
    "github.com",
    "https://github.com/",
    "github.com/orgs/vercel",
    "github.com/orgs/vercel/people",
    "github.com/settings",
    "github.com/settings/profile",
    "github.com/marketplace",
    "github.com/topics/react",
    "github.com/explore",
    "github.com/trending",
    "github.com/sponsors",
    "github.com/login",
    "https://api.github.com/",
  ]) {
    notUser(input);
  }
  assert.match((parseGitHubInput("github.com/orgs/vercel") as { reason: string }).reason, /organisation/);
});

test("invalid logins", () => {
  notUser("github.com/-gaearon");
  notUser("github.com/gaearon-");
  notUser("github.com/gae--aron");
  notUser(`github.com/${"a".repeat(40)}`);
  assert.deepEqual(parseGitHubInput(`github.com/${"a".repeat(39)}`), user("a".repeat(39)));
});

test("not a GitHub link: null, so a username or LinkedIn URL is handled elsewhere", () => {
  for (const input of [
    "",
    "gaearon",
    "@gaearon",
    "https://www.linkedin.com/in/dan-abramov-6b4a43/",
    "linkedin.com/in/jane-doe",
    "https://gitlab.com/gaearon",
    "https://notgithub.com/gaearon",
    "https://github.com.evil.example/gaearon",
  ]) {
    assert.equal(parseGitHubInput(input), null, input);
  }
});
