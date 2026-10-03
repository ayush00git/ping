import { test } from "node:test";
import assert from "node:assert/strict";
import { budget, LimitReached } from "./budget.ts";

const HOUR = 3_600_000;

test("allows max uses an hour, then says when the next one is possible", () => {
  let now = 0;
  const b = budget("lookups", 2, () => now);
  b.take();
  now = 1000;
  b.take();
  assert.throws(
    () => b.take(),
    (e) => e instanceof LimitReached && e.max === 2 && e.retryAt.getTime() === HOUR,
  );
});
test("a use stops counting an hour later", () => {
  let now = 0;
  const b = budget("lookups", 2, () => now);
  b.take();
  now = 1000;
  b.take();
  now = HOUR;
  b.take(); // the first use has expired
  assert.throws(() => b.take(), LimitReached);
});
