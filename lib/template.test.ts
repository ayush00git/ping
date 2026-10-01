import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySmtpError,
  cleanSubject,
  defaultDraft,
  describeDuration,
  estimateSeconds,
  fromAddress,
  fromName,
  hasOptOut,
  render,
  renderParts,
  stopsBatch,
  unknownTokens,
  validateMessage,
} from "./template.ts";

const dan = { name: "Dan Abramov", username: "gaearon", repo: "overreacted", repoUrl: "https://github.com/gaearon/overreacted" };

// render
test("render: every token", () => {
  const r = render("{{firstName}}|{{name}}|{{username}}|{{repo}}|{{repoUrl}}", dan);
  assert.equal(r.text, "Dan|Dan Abramov|gaearon|overreacted|https://github.com/gaearon/overreacted");
  assert.deepEqual(r.unknown, []);
  assert.deepEqual(r.fallbacks, []);
});
test("render: spaces and case inside braces are forgiven", () =>
  assert.equal(render("Hi {{ FirstName }}", dan).text, "Hi Dan"));
test("render: unknown tokens stay as typed and are reported", () => {
  const r = render("At {{compnay}} and {{compnay}}", dan);
  assert.equal(r.text, "At {{compnay}} and {{compnay}}");
  assert.deepEqual(r.unknown, ["{{compnay}}"]);
});
test("render: no name → \"there\", recorded as a fallback", () => {
  const r = render("Hi {{firstName}}, {{name}}", { ...dan, name: "" });
  assert.equal(r.text, "Hi there, gaearon");
  assert.deepEqual(r.fallbacks, ["firstName", "name"]);
});
test("render: name that's just the username → \"there\"", () => {
  const r = render("Hi {{firstName}}", { ...dan, name: "GAEARON" });
  assert.equal(r.text, "Hi there");
  assert.deepEqual(r.fallbacks, ["firstName"]);
});
test("renderParts: kinds for highlighting", () =>
  assert.deepEqual(
    renderParts("Hi {{firstName}} {{x}}", { ...dan, name: "" }).map((p) => p.kind),
    ["plain", "fallback", "plain", "unknown"],
  ));
test("unknownTokens across subject and body", () =>
  assert.deepEqual(unknownTokens("{{repo}} {{foo}}", "{{bar}} {{foo}} {{firstName}}"), ["{{foo}}", "{{bar}}"]));

// Default draft and sender
test("fromName / fromAddress", () => {
  assert.equal(fromName('"Dan Abramov" <dan@example.com>'), "Dan Abramov");
  assert.equal(fromName("Dan Abramov <dan@example.com>"), "Dan Abramov");
  assert.equal(fromName("dan@example.com"), "");
  assert.equal(fromAddress("Dan Abramov <dan@example.com>"), "dan@example.com");
  assert.equal(fromAddress("dan@example.com"), "dan@example.com");
});
test("default draft signs with the sender name and has an opt-out", () => {
  const d = defaultDraft("Dan Abramov");
  assert.equal(d.subject, "Saw {{repo}} on GitHub");
  assert.ok(d.body.includes("Best,\nDan Abramov"));
  assert.ok(hasOptOut(d.body));
  assert.deepEqual(unknownTokens(d.subject, d.body), []);
});
test("opt-out detection", () => {
  assert.equal(hasOptOut("Reply STOP to unsubscribe"), true);
  assert.equal(hasOptOut("Thanks!"), false);
});

// Validation
const ok = { to: "a@example.com", subject: "Hello", body: "Hi" };
test("validate: good message", () => assert.deepEqual(validateMessage(ok), { ok: true, ...ok }));
test("validate: CR/LF in the subject become spaces (no header injection)", () => {
  assert.equal(cleanSubject("Hi\r\nBcc: x@evil.com"), "Hi Bcc: x@evil.com");
  const r = validateMessage({ ...ok, subject: "Hi\r\nBcc: x@evil.com" });
  assert.ok(r.ok && r.subject === "Hi Bcc: x@evil.com");
});
test("validate: bad email → recipient error", () => {
  for (const to of ["not-an-email", "a@b", "a b@example.com", "<a@example.com>", "a@example.com, b@example.com"]) {
    const r = validateMessage({ ...ok, to });
    assert.ok(!r.ok && r.error.kind === "recipient", to);
  }
});
test("validate: length limits", () => {
  assert.equal(validateMessage({ ...ok, subject: "x".repeat(200) }).ok, true);
  assert.equal(validateMessage({ ...ok, subject: "x".repeat(201) }).ok, false);
  assert.equal(validateMessage({ ...ok, subject: " \r\n " }).ok, false);
  assert.equal(validateMessage({ ...ok, body: "x".repeat(20 * 1024) }).ok, true);
  assert.equal(validateMessage({ ...ok, body: "x".repeat(20 * 1024 + 1) }).ok, false);
  assert.equal(validateMessage({ ...ok, body: "é".repeat(10 * 1024 + 1) }).ok, false); // bytes, not characters
  assert.equal(validateMessage({ ...ok, body: "  " }).ok, false);
});
test("validate: unknown tokens block sending", () => {
  const r = validateMessage({ ...ok, body: "Hi {{compnay}}" });
  assert.ok(!r.ok && r.error.message.includes("{{compnay}}"));
});

// SMTP errors
test("classify: auth", () => {
  assert.equal(classifySmtpError({ code: "EAUTH", responseCode: 535, response: "535-5.7.8 Username and Password not accepted" }).kind, "auth");
  assert.equal(
    classifySmtpError({ code: "EAUTH" }).message,
    "Gmail rejected the login. Check SMTP_USER and the App Password in .env.local.",
  );
});
test("classify: limit", () => {
  assert.equal(classifySmtpError({ responseCode: 550, response: "550 5.4.5 Daily user sending limit exceeded." }).kind, "limit");
  assert.equal(classifySmtpError({ responseCode: 421, response: "421 4.7.0 Try again later, closing connection." }).kind, "limit");
});
test("classify: recipient", () => {
  assert.equal(classifySmtpError({ responseCode: 550, response: "550 5.1.1 The email account that you tried to reach does not exist." }).kind, "recipient");
  assert.equal(classifySmtpError({ code: "EENVELOPE", message: "No recipients defined" }).kind, "recipient");
});
test("classify: network", () => {
  for (const code of ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ENOTFOUND"]) assert.equal(classifySmtpError({ code }).kind, "network", code);
});
test("classify: other keeps the message, briefly", () => {
  const r = classifySmtpError(new Error("Something odd"));
  assert.deepEqual(r, { kind: "other", message: "Sending failed: Something odd" });
  assert.equal(classifySmtpError(undefined).kind, "other");
});
test("which errors stop the batch", () => {
  assert.deepEqual((["auth", "limit", "network", "recipient", "other"] as const).map(stopsBatch), [true, true, true, false, false]);
});

// Time estimate
test("estimate", () => {
  assert.equal(estimateSeconds(0), 0);
  assert.equal(estimateSeconds(1), 2);
  assert.equal(estimateSeconds(3), 13);
  assert.equal(describeDuration(13), "about 13 seconds");
  assert.equal(describeDuration(150), "about 3 minutes");
});
