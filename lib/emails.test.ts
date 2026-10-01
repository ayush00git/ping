import { test } from "node:test";
import assert from "node:assert/strict";
import type { Commit } from "./github.ts";
import { classify, collectCandidates, parseCoAuthors, statusLabel } from "./emails.ts";

const commit = (sha: string, email: string, name: string, date: string, login: string | null, message = "x"): Commit => ({
  sha,
  html_url: "",
  commit: { message, author: { name, email, date }, committer: null },
  author: login ? { login, avatar_url: "" } : null,
});

test("classify: personal address", () => assert.equal(classify("a@b.com"), "personal"));
test("classify: GitHub noreply", () => {
  assert.equal(classify("1+x@users.noreply.github.com"), "noreply");
  assert.equal(classify("noreply@github.com"), "noreply");
  assert.equal(statusLabel("1+x@users.noreply.github.com", "noreply"), "Private: GitHub noreply, can't receive mail");
});
test("classify: not a real address", () => {
  for (const e of ["me@localhost", "me@box.local", "x@nodot"]) assert.equal(classify(e), "noreply");
  assert.equal(statusLabel("me@localhost", "noreply"), "Not a real address, can't receive mail");
});
test("classify: no-reply mailboxes", () => {
  assert.equal(classify("noreply@anthropic.com"), "noreply");
  assert.equal(statusLabel("noreply@anthropic.com", "noreply"), "No-reply address, can't receive mail");
});
test("classify: bots and AI agents", () => {
  assert.equal(classify("49699333+dependabot[bot]@users.noreply.github.com"), "bot");
  assert.equal(classify("x@y.com", "renovate"), "bot");
  assert.equal(classify("codex@openai.com"), "bot");
  assert.equal(classify("cursoragent@cursor.com"), "bot");
});

test("parseCoAuthors: trailers, lowercased emails", () => {
  assert.deepEqual(parseCoAuthors("fix\n\nCo-authored-by: Jane Doe <Jane@Ex.com>\nco-authored-by: Bob <1+bob@users.noreply.github.com>"), [
    { name: "Jane Doe", email: "jane@ex.com" },
    { name: "Bob", email: "1+bob@users.noreply.github.com" },
  ]);
  assert.deepEqual(parseCoAuthors("no trailers here"), []);
});

const commits = [
  commit("s1", "Octo@Nowhere.com", "The Octocat", "2024-01-01T00:00:00Z", "octocat", "a\n\nCo-authored-by: Jane <jane@ex.com>"),
  commit("s2", "octo@nowhere.com", "Octo", "2024-02-01T00:00:00Z", "octocat"),
  commit("s3", "octo@nowhere.com", "The Octocat", "2023-01-01T00:00:00Z", "octocat"),
  commit("s4", "9+octocat@users.noreply.github.com", "The Octocat", "2024-03-01T00:00:00Z", "octocat"),
];
const found = collectCandidates({ commits, username: "OctoCat", fullName: "o/r" });

test("collectCandidates: dedupes case-insensitively and counts commits", () => {
  const octo = found.find((c) => c.email === "octo@nowhere.com");
  assert.ok(octo);
  assert.equal(octo.commits, 3);
  assert.equal(octo.name, "The Octocat"); // most frequent
  assert.equal(octo.sha, "s2"); // newest
  assert.equal(octo.lastSeen, "2024-02-01T00:00:00Z");
  assert.equal(octo.patchUrl, "https://github.com/o/r/commit/s2.patch");
});
test("collectCandidates: login match is case-insensitive", () => {
  assert.equal(found.find((c) => c.email === "octo@nowhere.com")?.isUser, true);
});
test("collectCandidates: co-authors are marked and not the user", () => {
  const jane = found.find((c) => c.email === "jane@ex.com");
  assert.equal(jane?.source, "co-author");
  assert.equal(jane?.isUser, false);
});
test("collectCandidates: sort puts usable first, then the user, then commit count", () => {
  assert.deepEqual(found.map((c) => [c.email, c.kind]), [
    ["octo@nowhere.com", "personal"],
    ["jane@ex.com", "personal"],
    ["9+octocat@users.noreply.github.com", "noreply"],
  ]);
});
