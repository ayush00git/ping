"use server";

import { deliver, mailStatus, testAddress } from "@/lib/mailer";
import { classifySmtpError, render, validateMessage, type RecipientFields, type SendError } from "@/lib/template";

export type SendResult =
  | { ok: true; id: string; dryRun: boolean; sentAt: string; to: string }
  | { ok: false; error: SendError };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Server actions are public POST endpoints: take nothing on trust. */
function readInput(input: unknown) {
  const i = (input ?? {}) as Record<string, unknown>;
  const v = (i.vars ?? {}) as Record<string, unknown>;
  const vars: RecipientFields = { name: str(v.name), username: str(v.username), repo: str(v.repo), repoUrl: str(v.repoUrl) };
  return { to: str(i.to), vars, subject: str(i.subject), body: str(i.body) };
}

async function personaliseAndSend(to: string, vars: RecipientFields, subjectTpl: string, bodyTpl: string, prefix = ""): Promise<SendResult> {
  try {
    const status = mailStatus();
    if (!status.configured) {
      return { ok: false, error: { kind: "other", message: `Email isn't set up. Missing: ${status.missing.join(", ")}.` } };
    }
    // The template first (unknown tokens, empty or long subject), then the personalised text.
    const template = validateMessage({ to, subject: subjectTpl, body: bodyTpl });
    if (!template.ok) return template;
    const message = validateMessage(
      { to, subject: prefix + render(subjectTpl, vars).text, body: render(bodyTpl, vars).text },
      { checkTokens: false },
    );
    if (!message.ok) return message;

    const sent = await deliver({ to: message.to, subject: message.subject, text: message.body });
    return sent.ok ? { ...sent, to: message.to } : sent;
  } catch (e) {
    return { ok: false, error: classifySmtpError(e) };
  }
}

/** One email to one person, with only their address in To. Never throws. */
export async function sendOne(input: { to: string; vars: RecipientFields; subject: string; body: string }): Promise<SendResult> {
  const { to, vars, subject, body } = readInput(input);
  return personaliseAndSend(to, vars, subject, body);
}

/** The previewed version, sent only to the sending account itself, with "[Test]" in front of the subject. */
export async function sendTest(input: { vars: RecipientFields; subject: string; body: string }): Promise<SendResult> {
  const { vars, subject, body } = readInput(input);
  return personaliseAndSend(testAddress(), vars, subject, body, "[Test] ");
}
