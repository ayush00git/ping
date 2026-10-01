import { test } from "node:test";
import assert from "node:assert/strict";
import type { Recipient } from "./shortlist.ts";
import { isSelected, logSend, selectedOf, setSelection, wasEmailed, withStatus, type SentLog } from "./outbox.ts";

const person = (email: string, extra: Partial<Recipient> = {}): Recipient => ({
  email,
  name: email.split("@")[0],
  username: "u",
  repo: "r",
  repoUrl: "https://github.com/u/r",
  addedAt: "2026-10-01T00:00:00.000Z",
  status: "ready",
  ...extra,
});
const log: SentLog = { "sent@example.com": { at: "2026-10-01T10:00:00.000Z" }, "dry@example.com": { at: "2026-10-01T11:00:00.000Z", dryRun: true } };

test("default selection: everyone not yet emailed", () => {
  const items = [person("new@example.com"), person("sent@example.com"), person("dry@example.com")];
  assert.deepEqual(selectedOf(items, {}, log).map((r) => r.email), ["new@example.com", "dry@example.com"]);
});
test("a dry run doesn't count as emailed", () => {
  assert.equal(wasEmailed(log, "dry@example.com"), false);
  assert.equal(wasEmailed(log, "sent@example.com"), true);
});
test("overrides beat the default, both ways", () => {
  const o = { "sent@example.com": true, "new@example.com": false };
  assert.equal(isSelected("sent@example.com", o, log), true);
  assert.equal(isSelected("new@example.com", o, log), false);
});
test("setSelection ticks only the given rows", () => {
  assert.deepEqual(setSelection({ "a@example.com": true }, ["b@example.com", "c@example.com"], false), {
    "a@example.com": true,
    "b@example.com": false,
    "c@example.com": false,
  });
});
test("withStatus: sent clears the old error and records the time", () => {
  const [r] = withStatus([person("a@example.com", { status: "failed", error: "x" })], "a@example.com", "sent", { sentAt: "2026-10-01T12:00:00.000Z" });
  assert.equal(r.status, "sent");
  assert.equal(r.sentAt, "2026-10-01T12:00:00.000Z");
  assert.equal(r.error, undefined);
  assert.equal(r.dryRun, false);
});
test("withStatus: failed keeps the reason and leaves others untouched", () => {
  const items = [person("a@example.com"), person("b@example.com")];
  const next = withStatus(items, "b@example.com", "failed", { error: "Gmail refused this address." });
  assert.equal(next[0], items[0]);
  assert.equal(next[1].error, "Gmail refused this address.");
});
test("logSend: a dry run never overwrites a real send", () => {
  assert.equal(logSend(log, "sent@example.com", "2026-10-02T00:00:00.000Z", true), log);
  assert.deepEqual(logSend(log, "dry@example.com", "2026-10-02T00:00:00.000Z", false)["dry@example.com"], { at: "2026-10-02T00:00:00.000Z" });
});
