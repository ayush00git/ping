import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { classifySmtpError, type SendError } from "@/lib/template";

/** The only mail settings the browser ever sees. Never the password. */
export type MailStatus = { configured: boolean; missing: string[]; dryRun: boolean; from: string | null };

const REQUIRED = ["SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const;

export const isDryRun = () => ["1", "true"].includes((process.env.MAIL_DRY_RUN ?? "").trim().toLowerCase());

export function mailStatus(): MailStatus {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  return { configured: missing.length === 0, missing, dryRun: isDryRun(), from: process.env.MAIL_FROM?.trim() || null };
}

/** Where "Send test to me" goes: the account that sends. */
export const testAddress = () => process.env.SMTP_USER?.trim() ?? "";

let transport: Transporter | null = null;
function getTransport(): Transporter {
  if (transport) return transport;
  if (isDryRun()) {
    // Builds the message and hands it back as JSON; nothing leaves the machine.
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export type DeliverResult = { ok: true; id: string; dryRun: boolean; sentAt: string } | { ok: false; error: SendError };

const MIN_GAP_MS = 2000; // server-side backstop to the browser's own pause between sends
let queue: Promise<unknown> = Promise.resolve();
let lastSend = 0;

/**
 * Sends one plain-text message to one address. Sends are queued, so two never overlap and they are
 * at least 2 seconds apart. Never throws.
 */
export function deliver(msg: { to: string; subject: string; text: string }): Promise<DeliverResult> {
  const run = async (): Promise<DeliverResult> => {
    const wait = lastSend + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const dryRun = isDryRun();
    const from = process.env.MAIL_FROM!.trim();
    const line = `to=${msg.to} subject=${JSON.stringify(msg.subject)} body=${JSON.stringify(msg.text.slice(0, 80))}`;
    try {
      // Plain text only: no HTML part, no tracking, no link rewriting. Only this person's address in To.
      const info = await getTransport().sendMail({ from, to: msg.to, replyTo: from, subject: msg.subject, text: msg.text });
      console.info(`[ping mail] ${dryRun ? "DRY RUN (not sent)" : "SENT"} ${line}`);
      return { ok: true, id: String(info.messageId ?? ""), dryRun, sentAt: new Date().toISOString() };
    } catch (e) {
      const error = classifySmtpError(e);
      console.warn(`[ping mail] FAILED (${error.kind}) ${line}`);
      return { ok: false, error };
    } finally {
      lastSend = Date.now();
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
