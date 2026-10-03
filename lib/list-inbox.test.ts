import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Recipient } from "./shortlist.ts";
import { appendToInbox, newerThan, readInbox } from "./list-inbox.ts";

const person = (email: string, addedAt: string): Recipient => ({
  email,
  name: email.split("@")[0],
  username: "u",
  repo: "r",
  repoUrl: "https://github.com/u/r",
  addedAt,
  status: "ready",
});
const tempFile = async () => path.join(await mkdtemp(path.join(tmpdir(), "ping-inbox-")), ".ping", "list-inbox.jsonl");

test("no file yet: empty", async () => {
  assert.deepEqual(await readInbox(await tempFile()), []);
});
test("appends create the folder and read back oldest first", async () => {
  const file = await tempFile();
  await appendToInbox(person("a@example.com", "2026-10-01T10:00:00.000Z"), file);
  await appendToInbox(person("b@example.com", "2026-10-01T11:00:00.000Z"), file);
  assert.deepEqual((await readInbox(file)).map((r) => r.email), ["a@example.com", "b@example.com"]);
});
test("skips half-written and invalid lines", async () => {
  const file = await tempFile();
  await appendToInbox(person("a@example.com", "2026-10-01T10:00:00.000Z"), file);
  await appendFile(file, '{"email":"x@example.com"}\n{"email":"half');
  assert.deepEqual((await readInbox(file)).map((r) => r.email), ["a@example.com"]);
});
test("newerThan: only entries after the cursor", () => {
  const items = [person("a@example.com", "2026-10-01T10:00:00.000Z"), person("b@example.com", "2026-10-01T11:00:00.000Z")];
  assert.deepEqual(newerThan(items, "").map((r) => r.email), ["a@example.com", "b@example.com"]);
  assert.deepEqual(newerThan(items, "2026-10-01T10:00:00.000Z").map((r) => r.email), ["b@example.com"]);
  assert.deepEqual(newerThan(items, "2026-10-01T11:00:00.000Z"), []);
});
