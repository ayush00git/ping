// Pure helpers for choosing who gets an email and recording what happened. No I/O, so they're testable.
import type { Recipient } from "./shortlist.ts"; // type only: erased, so tests never load React

/** email → when it was emailed. Dry runs are recorded too, but never count as "emailed". */
export type SentLog = Record<string, { at: string; dryRun?: boolean }>;
/** email → ticked or not, where the user changed it. Everyone else follows the default. */
export type SelectionOverrides = Record<string, boolean>;

export const wasEmailed = (log: SentLog, email: string) => !!log[email] && !log[email].dryRun;

/** Default: everyone not yet emailed is ticked. */
export const isSelected = (email: string, overrides: SelectionOverrides, log: SentLog) =>
  overrides[email] ?? !wasEmailed(log, email);

export function selectedOf<T extends { email: string }>(items: T[], overrides: SelectionOverrides, log: SentLog): T[] {
  return items.filter((r) => isSelected(r.email, overrides, log));
}

/** Tick or untick several rows at once (the header checkbox acts on the visible rows only). */
export function setSelection(overrides: SelectionOverrides, emails: string[], on: boolean): SelectionOverrides {
  const next = { ...overrides };
  for (const e of emails) next[e] = on;
  return next;
}

export type StatusExtra = { sentAt?: string; error?: string; dryRun?: boolean };

/** The list with one person's status changed. A success clears an old error; a failure keeps the last sentAt. */
export function withStatus(items: Recipient[], email: string, status: Recipient["status"], extra: StatusExtra = {}): Recipient[] {
  return items.map((r) => {
    if (r.email !== email) return r;
    const next: Recipient = { ...r, status };
    if (status === "sent") {
      next.sentAt = extra.sentAt ?? new Date().toISOString();
      next.dryRun = !!extra.dryRun;
      delete next.error;
    } else if (status === "failed") {
      next.error = extra.error ?? "Sending failed.";
    }
    return next;
  });
}

/** Records a send in the log. Real sends overwrite dry runs, never the other way round. */
export function logSend(log: SentLog, email: string, at: string, dryRun: boolean): SentLog {
  if (dryRun && log[email] && !log[email].dryRun) return log;
  return { ...log, [email]: dryRun ? { at, dryRun: true } : { at } };
}
