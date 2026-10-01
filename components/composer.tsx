"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sendOne, sendTest, type SendResult } from "@/app/actions";
import type { MailStatus } from "@/lib/mailer";
import { selectedOf } from "@/lib/outbox";
import { useDraft, useHydrated, useSelection, useSentLog, useShortlist, type Recipient } from "@/lib/shortlist";
import {
  TOKENS,
  cleanSubject,
  defaultDraft,
  describeDuration,
  estimateSeconds,
  fromAddress,
  hasOptOut,
  hasPlaceholder,
  isEmail,
  MAX_SUBJECT,
  renderParts,
  stopsBatch,
  unknownTokens,
  type Part,
  type RecipientFields,
  type SendError,
} from "@/lib/template";
import { Bone, Card, Email, plural } from "@/components/ui";
import { STICKY_SIDE } from "@/components/layout";

const GAP_MS = 4000; // pause between sends, so Gmail sees a person-paced trickle
const CHIPS_SHOWN = 6;

type RowState = { status: "waiting" | "sending" | "sent" | "failed" | "skipped"; at?: string; error?: string; dryRun?: boolean };
type TestState =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "done"; to: string; as: string; dryRun: boolean; draftKey: string }
  | { state: "failed"; error: SendError };

const fields = (r: Recipient): RecipientFields => ({ name: r.name, username: r.username, repo: r.repo, repoUrl: r.repoUrl });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** A pause that ends early when the user presses Stop. */
async function pause(ms: number, stopped: { current: boolean }) {
  const until = Date.now() + ms;
  while (Date.now() < until && !stopped.current) await new Promise((r) => setTimeout(r, 100));
}

export default function Composer({ status, senderName }: { status: MailStatus; senderName: string }) {
  const hydrated = useHydrated();
  const { items, setStatus } = useShortlist();
  const log = useSentLog();
  const { overrides, set: setSelected, reset: resetSelection } = useSelection();
  const [saved, saveDraft] = useDraft();
  const draft = saved ?? defaultDraft(senderName);

  const [previewAt, setPreviewAt] = useState(0);
  const [showAllChips, setShowAllChips] = useState(false);
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const [batch, setBatch] = useState<Recipient[]>([]); // frozen when sending starts
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const [halt, setHalt] = useState<SendError | null>(null);
  const stopRef = useRef(false);
  const [sentMsg, setSentMsg] = useState(draft); // the exact message being sent, frozen at "Send"
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  const dialogRef = useRef<HTMLDialogElement>(null);

  // The body grows with its text instead of scrolling inside a small box.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [draft.body, hydrated, batch.length]);

  // Leaving mid-send would silently skip people.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  if (!hydrated) return <ComposerSkeleton />;

  const newestFirst = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const recipients = selectedOf(newestFirst, overrides, log);
  const sending = batch.length > 0;

  // ---- Empty states ----
  if (!sending && items.length === 0) {
    return (
      <Empty title="Your list is empty.">
        <Link href="/" className="text-accent underline underline-offset-2">
          Look someone up first
        </Link>
        .
      </Empty>
    );
  }
  if (!sending && recipients.length === 0) {
    return (
      <Empty title="No one selected.">
        <Link href="/list" className="text-accent underline underline-offset-2">
          Choose people on your list
        </Link>
        .
      </Empty>
    );
  }

  const setDraft = (next: Partial<typeof draft>) => saveDraft({ ...draft, ...next });
  const fallbackDraft = defaultDraft(senderName);
  const isDefault = draft.subject === fallbackDraft.subject && draft.body === fallbackDraft.body;
  function resetDraft() {
    // Only a changed message is worth a confirmation; a changed subject is quick to retype.
    if (draft.body !== fallbackDraft.body && !confirm("Reset the message to the default template? Your edits will be lost.")) return;
    saveDraft(null); // null = follow the default (and the sender name) from now on
  }

  function insertToken(key: string) {
    const field = lastField.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const text = draft[field];
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const token = `{{${key}}}`;
    setDraft({ [field]: text.slice(0, start) + token + text.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  // ---- Pre-flight checks (only ✗ items block sending) ----
  const subject = cleanSubject(draft.subject);
  const unknown = unknownTokens(draft.subject, draft.body);
  const draftKey = `${draft.subject}\u0000${draft.body}`;
  const testCurrent = test.state === "done" && test.draftKey === draftKey;
  const checks: { ok: boolean; blocks: boolean; text: string }[] = [
    {
      ok: subject.length > 0 && subject.length <= MAX_SUBJECT,
      blocks: true,
      text: !subject ? "Write a subject" : subject.length > MAX_SUBJECT ? `Shorten the subject to ${MAX_SUBJECT} characters` : "Subject written",
    },
    { ok: draft.body.trim().length > 0, blocks: true, text: draft.body.trim() ? "Message written" : "Write a message" },
    {
      ok: !hasPlaceholder(draft.body),
      blocks: true,
      text: hasPlaceholder(draft.body) ? "Replace the [placeholder] line with why you're writing" : "Placeholder line replaced",
    },
    { ok: unknown.length === 0, blocks: true, text: unknown.length ? `Fix ${unknown.join(", ")}` : "No unknown tokens" },
    {
      ok: hasOptOut(draft.body),
      blocks: false,
      text: hasOptOut(draft.body) ? "Opt-out line present" : "No opt-out line. Recommended: tell people how to say no",
    },
    {
      ok: testCurrent,
      blocks: false,
      text: testCurrent
        ? "Test sent to yourself"
        : test.state === "done"
          ? "Test sent before your last edit (recommended: send another)"
          : "Send yourself a test first (recommended)",
    },
  ];
  // Not blocking: the rest still go out, and these rows fail on their own.
  const invalid = recipients.filter((r) => !isEmail(r.email));
  if (invalid.length) {
    checks.push({
      ok: false,
      blocks: false,
      text: `${plural(invalid.length, "address isn't", "addresses aren't")} valid and will fail: ${invalid.map((r) => r.email).join(", ")}`,
    });
  }
  const blocked = checks.some((c) => c.blocks && !c.ok);
  const cantSendWhy = !status.configured
    ? `Email isn't set up. Missing: ${status.missing.join(", ")}.`
    : blocked
      ? "Fix the items marked ✗ first."
      : null;

  const at = Math.min(previewAt, recipients.length - 1);
  const previewed = recipients[at];

  async function onSendTest() {
    setTest({ state: "sending" });
    let res: SendResult;
    try {
      res = await sendTest({ vars: fields(previewed), subject: draft.subject, body: draft.body });
    } catch {
      res = { ok: false, error: { kind: "network", message: "Couldn't reach the ping server. Is it still running?" } };
    }
    setTest(
      res.ok
        ? { state: "done", to: res.to, as: previewed.name || previewed.username, dryRun: res.dryRun, draftKey }
        : { state: "failed", error: res.error },
    );
  }

  // ---- Sending ----
  const setRow = (email: string, row: RowState) => setRows((prev) => ({ ...prev, [email]: row }));

  async function run(queue: Recipient[], { subject, body }: { subject: string; body: string }) {
    stopRef.current = false;
    setHalt(null);
    setRunning(true);
    for (let i = 0; i < queue.length && !stopRef.current; i++) {
      if (i > 0) {
        await pause(GAP_MS, stopRef);
        if (stopRef.current) break;
      }
      const r = queue[i];
      setRow(r.email, { status: "sending" });
      let res: SendResult;
      try {
        res = await sendOne({ to: r.email, vars: fields(r), subject, body });
      } catch {
        res = { ok: false, error: { kind: "network", message: "Couldn't reach the ping server. Is it still running?" } };
      }
      if (res.ok) {
        setRow(r.email, { status: "sent", at: res.sentAt, dryRun: res.dryRun });
        setStatus(r.email, "sent", { sentAt: res.sentAt, dryRun: res.dryRun });
      } else {
        setRow(r.email, { status: "failed", error: res.error.message });
        setStatus(r.email, "failed", { error: res.error.message });
        // Login, limit and network problems would fail every remaining send too.
        if (stopsBatch(res.error.kind)) {
          setHalt(res.error);
          stopRef.current = true;
        }
      }
    }
    // Anyone not reached is Skipped, ready for Resume.
    setRows((prev) =>
      Object.fromEntries(Object.entries(prev).map(([e, row]) => [e, row.status === "waiting" ? { status: "skipped" } : row])),
    );
    setRunning(false);
  }

  function start() {
    dialogRef.current?.close();
    setSentMsg(draft);
    setBatch(recipients);
    setRows(Object.fromEntries(recipients.map((r) => [r.email, { status: "waiting" } as RowState])));
    void run(recipients, draft);
  }

  function again(which: "skipped" | "failed") {
    const queue = batch.filter((r) => rows[r.email]?.status === which);
    setRows((prev) => ({ ...prev, ...Object.fromEntries(queue.map((r) => [r.email, { status: "waiting" } as RowState])) }));
    void run(queue, sentMsg);
  }

  function writeAnother() {
    resetSelection(); // back to the default: everyone not yet emailed
    setBatch([]);
    setRows({});
    setHalt(null);
    setTest({ state: "idle" });
    setPreviewAt(0);
  }

  const n = recipients.length;
  const chips = showAllChips ? recipients : recipients.slice(0, CHIPS_SHOWN);

  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">New email</h2>
      <p className="mt-1 text-sm text-muted">
        To {plural(sending ? batch.length : n, "person", "people")} · each gets their own email
      </p>

      <ModeBanner status={status} />

      {sending ? (
        <SendProgress
          dryRun={status.dryRun}
          batch={batch}
          rows={rows}
          running={running}
          halt={halt}
          draft={sentMsg}
          onStop={() => (stopRef.current = true)}
          onResume={() => again("skipped")}
          onRetry={() => again("failed")}
          onWriteAnother={writeAnother}
        />
      ) : (
        <>
          {/* Recipients */}
          <div className="mt-6 flex flex-wrap items-center gap-2" aria-label="Recipients">
            {chips.map((r) => (
              <span key={r.email} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1 pr-1 pl-3 text-sm">
                <span title={r.email}>{r.name || r.username}</span>
                <button
                  type="button"
                  onClick={() => setSelected([r.email], false)}
                  aria-label={`Leave ${r.name || r.username} (${r.email}) out of this email`}
                  className="grid size-6 cursor-pointer place-items-center rounded-full text-muted transition hover:bg-accent-soft hover:text-accent"
                >
                  ×
                </button>
              </span>
            ))}
            {n > CHIPS_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllChips((v) => !v)}
                className="cursor-pointer rounded-full px-2 py-1 text-sm text-accent underline-offset-4 hover:underline"
              >
                {showAllChips ? "Show fewer" : `+${n - CHIPS_SHOWN} more`}
              </button>
            )}
            <Link href="/list" className="ml-1 text-sm text-accent underline-offset-4 hover:underline">
              Edit selection
            </Link>
          </div>

          <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-start">
            {/* Draft */}
            <section aria-labelledby="draft-h">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id="draft-h" className="font-medium">
                  Draft
                </h3>
                <span className="ml-auto text-[13px] text-muted" aria-live="polite">
                  {isDefault ? "Using the default template" : "Draft saved"}
                </span>
                {!isDefault && (
                  <button
                    type="button"
                    onClick={resetDraft}
                    className="cursor-pointer text-[13px] text-accent underline-offset-4 hover:underline"
                  >
                    Reset to default
                  </button>
                )}
              </div>
              <Card className="mt-3">
                <label htmlFor="subject" className="text-sm font-medium">
                  Subject
                </label>
                <input
                  id="subject"
                  ref={subjectRef}
                  value={draft.subject}
                  onChange={(e) => setDraft({ subject: e.target.value })}
                  onFocus={() => (lastField.current = "subject")}
                  maxLength={MAX_SUBJECT + 50}
                  className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />

                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-sm text-muted">Insert:</span>
                  {TOKENS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      // Keep focus (and the cursor) in the field being edited.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertToken(t.key)}
                      aria-label={`Insert ${t.label} ({{${t.key}}})`}
                      title={`{{${t.key}}}`}
                      className="cursor-pointer rounded-lg border border-line px-2.5 py-1 text-[13px] transition hover:border-accent hover:text-accent"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <label htmlFor="body" className="mt-4 block text-sm font-medium">
                  Message
                </label>
                <textarea
                  id="body"
                  ref={bodyRef}
                  value={draft.body}
                  onChange={(e) => setDraft({ body: e.target.value })}
                  onFocus={() => (lastField.current = "body")}
                  rows={10}
                  className="mt-1.5 min-h-56 w-full resize-none overflow-hidden rounded-xl border border-line bg-bg px-3 py-2.5 text-[15px] leading-relaxed outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />
                <p className="mt-2 text-[13px] text-muted">
                  Plain text. Each person gets their own copy with their details filled in. Replies come to{" "}
                  {status.from ? <Email email={fromAddress(status.from)} /> : "you"}.
                </p>
              </Card>
            </section>

            {/* Wide screens: preview, checks and Send stay in view while the draft scrolls. */}
            <div className={`${STICKY_SIDE} lg:-mx-2 lg:px-2`}>
              {/* Preview */}
              <section aria-labelledby="preview-h">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id="preview-h" className="font-medium">
                    <label htmlFor="preview-for">Preview for</label>
                  </h3>
                  <select
                    id="preview-for"
                    value={at}
                    onChange={(e) => setPreviewAt(Number(e.target.value))}
                    className="min-w-0 max-w-64 cursor-pointer rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                  >
                    {recipients.map((r, i) => (
                      <option key={r.email} value={i}>
                        {r.name || r.username}
                      </option>
                    ))}
                  </select>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="mr-1 text-[13px] text-muted">
                      {at + 1} of {n}
                    </span>
                    <StepButton label="Previous person" disabled={at === 0} onClick={() => setPreviewAt(at - 1)}>
                      ‹
                    </StepButton>
                    <StepButton label="Next person" disabled={at === n - 1} onClick={() => setPreviewAt(at + 1)}>
                      ›
                    </StepButton>
                  </div>
                </div>
                <Preview r={previewed} draft={draft} from={status.from} />
              </section>

              {/* Pre-flight checks and actions */}
              <section aria-labelledby="checks-h" className="mt-8">
                <h3 id="checks-h" className="font-medium">
                  Before you send
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {checks.map((c) => (
                    <li key={c.text} className={`flex gap-2 ${!c.ok && c.blocks ? "text-danger" : c.ok ? "" : "text-muted"}`}>
                      <span aria-hidden className="w-4 shrink-0 text-center">
                        {c.ok ? "✓" : c.blocks ? "✗" : "–"}
                      </span>
                      <span>
                        <span className="sr-only">{c.ok ? "Done: " : c.blocks ? "Must fix: " : "Recommended: "}</span>
                        {c.text}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onSendTest}
                    disabled={!!cantSendWhy || test.state === "sending"}
                    className="cursor-pointer rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {test.state === "sending" ? "Sending test…" : "Send test to me"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dialogRef.current?.showModal()}
                    disabled={!!cantSendWhy}
                    className="cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:text-bg"
                  >
                    Send to {plural(n, "person", "people")}
                    {status.dryRun && " (dry run)"}
                  </button>
                </div>
                <div aria-live="polite" className="mt-2 text-sm">
                  {cantSendWhy && <p className="text-muted">{cantSendWhy}</p>}
                  {test.state === "done" && (
                    <p>
                      {test.dryRun ? "Dry run: test logged on the server for " : "Test sent to "}
                      <Email email={test.to} /> (as {test.as}).
                    </p>
                  )}
                  {test.state === "failed" && <p className="text-danger">Test not sent. {test.error.message}</p>}
                </div>
              </section>
            </div>
          </div>

          <ConfirmDialog
            ref={dialogRef}
            status={status}
            count={n}
            subject={draft.subject}
            onSend={start}
          />
        </>
      )}
    </div>
  );
}

function ModeBanner({ status }: { status: MailStatus }) {
  const [tone, label, text] = !status.configured
    ? ["border-danger bg-surface text-danger", "Not set up", `Email isn't set up. Missing: ${status.missing.join(", ")}. The preview still works.`]
    : status.dryRun
      ? ["border-warn/40 bg-warn-soft text-ink", "Dry run", "Emails are logged on the server, not sent."]
      : ["border-accent/40 bg-accent-soft text-ink", "Live", `Emails go out from ${status.from}.`];
  return (
    <p role="status" className={`mt-5 max-w-2xl rounded-xl border px-4 py-2.5 text-sm ${tone}`}>
      <strong className="font-semibold">{label}:</strong> {text}
    </p>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line bg-surface text-lg leading-none transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Highlighted({ parts }: { parts: Part[] }) {
  return parts.map((p, i) =>
    p.kind === "unknown" ? (
      <mark key={i} className="rounded bg-danger/15 px-0.5 text-danger">
        {p.text}
      </mark>
    ) : p.kind === "fallback" || p.kind === "placeholder" ? (
      <mark key={i} className="rounded bg-warn-soft px-0.5 text-warn">
        {p.text}
      </mark>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

function Preview({ r, draft, from }: { r: Recipient; draft: { subject: string; body: string }; from: string | null }) {
  const subject = renderParts(cleanSubject(draft.subject), fields(r));
  const body = renderParts(draft.body, fields(r));
  const used = new Set([...subject, ...body].filter((p) => p.kind === "fallback").map((p) => p.token));
  return (
    <Card className="mt-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-b border-line pb-3 text-sm">
        <dt className="text-muted">From</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">{from ?? "(not set)"}</dd>
        <dt className="text-muted">To</dt>
        <dd className="min-w-0">
          <Email email={r.email} />
          {!isEmail(r.email) && <span className="block text-[13px] text-danger">Not a valid address, so this one will fail.</span>}
        </dd>
        <dt className="text-muted">Subject</dt>
        <dd className="min-w-0 font-medium [overflow-wrap:anywhere]">
          <Highlighted parts={subject} />
        </dd>
      </dl>
      {/* Wide screens: a long message scrolls here, so the checks and Send below stay on screen. */}
      <div
        tabIndex={0}
        aria-label="Message as this person gets it"
        className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] lg:max-h-[max(10rem,calc(100dvh_-_34rem))] lg:overflow-y-auto"
      >
        <Highlighted parts={body} />
      </div>
      {used.size > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-[13px] text-warn">
          {used.has("firstName") && <li>No name on GitHub, so &ldquo;there&rdquo; is used.</li>}
          {used.has("name") && <li>No name on GitHub, so their username is used as the full name.</li>}
        </ul>
      )}
    </Card>
  );
}

function ConfirmDialog({
  ref,
  status,
  count,
  subject,
  onSend,
}: {
  ref: React.Ref<HTMLDialogElement>;
  status: MailStatus;
  count: number;
  subject: string;
  onSend: () => void;
}) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-h"
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-6 text-ink backdrop:bg-black/50"
    >
      <h2 id="confirm-h" className="text-lg font-semibold">
        Send {plural(count, "email")}?
      </h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">From</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">{status.from}</dd>
        <dt className="text-muted">To</dt>
        <dd>{plural(count, "person", "people")}</dd>
        <dt className="text-muted">Subject</dt>
        <dd className="min-w-0 [overflow-wrap:anywhere]">{cleanSubject(subject)}</dd>
        <dt className="text-muted">Takes</dt>
        <dd>{describeDuration(estimateSeconds(count))}</dd>
      </dl>
      <p className="mt-4 text-sm">Each person gets a separate email.</p>
      {status.dryRun && <p className="mt-1 text-sm text-muted">Dry run: nothing will actually be sent.</p>}
      <div className="mt-6 flex justify-end gap-2">
        <form method="dialog">
          <button
            autoFocus
            className="cursor-pointer rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent"
          >
            Cancel
          </button>
        </form>
        <button
          type="button"
          onClick={onSend}
          className="cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-bg"
        >
          Send {plural(count, "email")}
          {status.dryRun && " (dry run)"}
        </button>
      </div>
    </dialog>
  );
}

const PILL: Record<RowState["status"], string> = {
  waiting: "border-line text-muted",
  sending: "border-accent text-accent",
  sent: "border-line text-ink",
  failed: "border-danger text-danger",
  skipped: "border-line text-muted",
};

function pillText(row: RowState) {
  switch (row.status) {
    case "waiting":
      return "Waiting";
    case "sending":
      return "Sending…";
    case "sent":
      return `${row.dryRun ? "Logged (dry run)" : "Sent"} ${time(row.at!)}`;
    case "failed":
      return `Failed: ${row.error}`;
    case "skipped":
      return "Skipped";
  }
}

function SendProgress({
  dryRun,
  batch,
  rows,
  running,
  halt,
  draft,
  onStop,
  onResume,
  onRetry,
  onWriteAnother,
}: {
  dryRun: boolean;
  batch: Recipient[];
  rows: Record<string, RowState>;
  running: boolean;
  halt: SendError | null;
  draft: { subject: string; body: string };
  onStop: () => void;
  onResume: () => void;
  onRetry: () => void;
  onWriteAnother: () => void;
}) {
  const count = (s: RowState["status"]) => batch.filter((r) => rows[r.email]?.status === s).length;
  const sent = count("sent");
  const failed = count("failed");
  const skipped = count("skipped");
  const done = !running;
  const sentWord = dryRun ? "logged (dry run)" : "sent";

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-12 lg:items-start">
      {/* The message, read-only while sending */}
      <Card className="lg:col-span-5">
        <p className="text-xs text-muted">Subject</p>
        <p className="font-medium [overflow-wrap:anywhere]">{cleanSubject(draft.subject)}</p>
        <p className="mt-3 text-xs text-muted">Message</p>
        <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted">{draft.body}</p>
      </Card>

      <Card className="lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium" aria-live="polite">
            {done
              ? [
                  `${sent} ${sentWord}`,
                  failed && `${failed} failed`,
                  skipped && `${skipped} skipped`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : [`${sent + failed} of ${batch.length} done`, failed && `${failed} failed`].filter(Boolean).join(" · ")}
          </p>
          {running ? (
            <button type="button" onClick={onStop} className="cursor-pointer rounded-xl border border-line px-4 py-1.5 text-sm transition hover:border-danger hover:text-danger">
              Stop
            </button>
          ) : (
            skipped > 0 && (
              <button type="button" onClick={onResume} className="cursor-pointer rounded-xl bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:opacity-90 dark:text-bg">
                Resume {plural(skipped, "email")}
              </button>
            )
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Sending progress"
          aria-valuemin={0}
          aria-valuemax={batch.length}
          aria-valuenow={sent + failed}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
        >
          <div className="h-full bg-accent transition-all" style={{ width: `${((sent + failed) / batch.length) * 100}%` }} />
        </div>

        {halt && (
          <p role="alert" className="mt-4 rounded-xl border border-danger px-3 py-2 text-sm text-danger">
            Sending stopped. {halt.message}
          </p>
        )}

        <ul className="mt-4 divide-y divide-line">
          {batch.map((r) => {
            const row = rows[r.email] ?? { status: "waiting" };
            return (
              <li key={r.email} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{r.name || r.username}</p>
                  <Email email={r.email} className="text-[13px] text-muted" />
                </div>
                <span className={`max-w-full rounded-md border px-2 py-0.5 text-xs [overflow-wrap:anywhere] ${PILL[row.status]}`}>{pillText(row)}</span>
              </li>
            );
          })}
        </ul>

        {done && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
            {failed > 0 && (
              <button type="button" onClick={onRetry} className="cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 dark:text-bg">
                Retry {failed} failed
              </button>
            )}
            <Link href="/list" className="rounded-xl border border-line px-4 py-2 text-sm transition hover:border-accent">
              Back to your list
            </Link>
            <button type="button" onClick={onWriteAnother} className="cursor-pointer rounded-xl border border-line px-4 py-2 text-sm transition hover:border-accent">
              Write another email
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">New email</h2>
      <Card className="mt-6 max-w-2xl">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted">{children}</p>
      </Card>
    </div>
  );
}

function ComposerSkeleton() {
  return (
    <div className="mt-10" aria-busy="true">
      <p role="status" className="sr-only">
        Loading…
      </p>
      <div className="motion-safe:animate-pulse" aria-hidden>
        <Bone className="h-5 w-28" />
        <Bone className="mt-2 h-3.5 w-56" />
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <Card>
            <Bone className="h-9 w-full" />
            <Bone className="mt-4 h-48 w-full" />
          </Card>
          <Card>
            <Bone className="h-4 w-2/3" />
            <Bone className="mt-3 h-40 w-full" />
          </Card>
        </div>
      </div>
    </div>
  );
}
