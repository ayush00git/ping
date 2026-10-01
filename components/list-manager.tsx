"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHydrated, useSelection, useSentLog, useShortlist, type Recipient } from "@/lib/shortlist";
import { isSelected, wasEmailed, type SentLog } from "@/lib/outbox";
import { formatDate } from "@/components/format";
import { Bone, Card, Email, plural } from "@/components/ui";

const UNDO_MS = 6000;
const FILTER_FROM = 9; // show the filter box only when the list has more than 8 people

const STATUS: Record<Recipient["status"], string> = {
  ready: "Ready",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** The sent log is the source of truth for "Sent", so it survives remove + re-add. */
function statusText(r: Recipient, log: SentLog) {
  if (r.status === "failed") return `Failed: ${r.error ?? "unknown reason"}`;
  const entry = log[r.email];
  if (entry && !entry.dryRun) return `Sent ${formatDate(entry.at)}`;
  if (entry?.dryRun) return `Dry run ${formatDate(entry.at)} (not sent)`;
  return STATUS[r.status];
}

type RowProps = {
  log: SentLog;
  ticked: (r: Recipient) => boolean;
  onTick: (r: Recipient, on: boolean) => void;
  onRemove: (r: Recipient) => void;
};

function Tick({ r, ticked, onTick }: { r: Recipient; ticked: boolean; onTick: RowProps["onTick"] }) {
  return (
    <input
      type="checkbox"
      checked={ticked}
      onChange={(e) => onTick(r, e.target.checked)}
      aria-label={`Include ${r.name} (${r.email}) in the next email`}
      className="size-4 cursor-pointer accent-[var(--accent)]"
    />
  );
}

/** Shown when someone already emailed is ticked again, so a second email is never an accident. */
function AlreadyEmailed({ r, log, ticked }: { r: Recipient; log: SentLog; ticked: boolean }) {
  if (!ticked || !wasEmailed(log, r.email)) return null;
  return <span className="mt-1 block text-[13px] text-danger">Already emailed on {shortDate(log[r.email].at)}</span>;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function ListManager() {
  const { items, remove, restore, clear } = useShortlist();
  const log = useSentLog();
  const { overrides, set: setSelected } = useSelection();
  const hydrated = useHydrated();
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState<Recipient | null>(null);
  const restoredRef = useRef<string | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The undo bar disappears after a few seconds; a newer removal restarts the clock.
  useEffect(() => {
    if (!removed) return;
    const t = setTimeout(() => {
      // Don't strand keyboard focus on a button that's about to vanish.
      if (document.activeElement === undoRef.current) headingRef.current?.focus();
      setRemoved(null);
    }, UNDO_MS);
    return () => clearTimeout(t);
  }, [removed]);

  // After Undo, focus the restored person's Remove button (the visible one: table or card).
  useEffect(() => {
    const email = restoredRef.current;
    if (!email || !items.some((r) => r.email === email)) return;
    restoredRef.current = null;
    const buttons = document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${CSS.escape(`Remove ${email}`)}"]`);
    [...buttons].find((b) => b.offsetParent !== null)?.focus();
  }, [items]);

  // The row's Remove button is gone, so keyboard focus moves to Undo.
  useEffect(() => {
    if (removed) undoRef.current?.focus();
  }, [removed]);

  if (!hydrated) return <ListSkeleton />;

  const newestFirst = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const showFilter = items.length >= FILTER_FROM;
  // A filter typed earlier stops applying once the box hides (the list shrank to 8 or fewer).
  const q = showFilter ? fold(query.trim()) : "";
  const rows = q
    ? newestFirst.filter((r) => [r.name, r.email, r.username].some((v) => fold(v).includes(q)))
    : newestFirst;

  const onRemove = (r: Recipient) => {
    remove(r.email);
    setRemoved(r);
  };

  const ticked = (r: Recipient) => isSelected(r.email, overrides, log);
  const onTick = (r: Recipient, on: boolean) => setSelected([r.email], on);
  const selectedCount = items.filter(ticked).length;
  const rowProps: RowProps = { log, ticked, onTick, onRemove };

  const actions = (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
      {selectedCount === 0 && <span className="text-sm text-muted">Select at least one person</span>}
      {selectedCount > 0 ? (
        <Link
          href="/compose"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium whitespace-nowrap text-white transition hover:opacity-90 dark:text-bg"
        >
          Compose email to {plural(selectedCount, "person", "people")} →
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-xl bg-accent px-4 py-2 text-sm font-medium whitespace-nowrap text-white opacity-40 dark:text-bg"
        >
          Compose email to 0 people →
        </button>
      )}
      <button type="button" onClick={() => downloadCsv(newestFirst)} className={SECONDARY}>
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm(`Remove all ${plural(items.length, "person", "people")} from your list?`)) {
            clear();
            setRemoved(null);
            setQuery("");
          }
        }}
        className={`${SECONDARY} hover:border-danger hover:text-danger`}
      >
        Clear list
      </button>
    </div>
  );

  return (
    <section aria-labelledby="list-h" className="mt-12">
      {/* With a short list the actions sit on the heading row; a long list gets a filter row for them. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="list-h" ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight outline-none">
            Your list
          </h2>
          <p className="mt-1 text-sm text-muted">{plural(items.length, "person", "people")} · saved in this browser only</p>
        </div>
        {items.length > 0 && !showFilter && actions}
      </div>

      {removed && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm"
        >
          <span className="min-w-0">
            Removed <Email email={removed.email} />
          </span>
          <button
            ref={undoRef}
            type="button"
            onClick={() => {
              restore(removed);
              restoredRef.current = removed.email;
              setRemoved(null);
            }}
            className="cursor-pointer font-medium text-accent underline-offset-4 hover:underline"
          >
            Undo
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <Card className="mt-6 max-w-2xl">
          <p className="font-medium">Your list is empty.</p>
          <p className="mt-1 text-sm text-muted">
            <Link href="/" className="text-accent underline underline-offset-2">
              Look someone up
            </Link>{" "}
            and press Yes, add.
          </p>
        </Card>
      ) : (
        <>
          {showFilter && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-56 sm:max-w-md">
                <label htmlFor="list-filter" className="sr-only">
                  Filter by name, email or username
                </label>
                <input
                  id="list-filter"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by name, email or username"
                  autoComplete="off"
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none transition placeholder:text-muted focus:border-accent focus:ring-4 focus:ring-accent-soft"
                />
              </div>
              {actions}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="mt-6 text-sm text-muted">
              No one matches &ldquo;{query.trim()}&rdquo;.{" "}
              <button
                type="button"
                onClick={() => setQuery("")}
                className="cursor-pointer text-accent underline underline-offset-2"
              >
                Clear filter
              </button>
            </p>
          ) : (
            <>
              {q && (
                <p className="mt-4 text-sm text-muted">
                  Showing {rows.length} of {items.length}.
                </p>
              )}
              <ListTable rows={rows} {...rowProps} onTickAll={(on) => setSelected(rows.map((r) => r.email), on)} />
              <ListCards rows={rows} {...rowProps} />
            </>
          )}
        </>
      )}
    </section>
  );
}

const SECONDARY =
  "cursor-pointer rounded-xl border border-line bg-surface px-3.5 py-2 text-sm whitespace-nowrap transition hover:border-accent";

function FoundIn({ r }: { r: Recipient }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      <Link href={`/?u=${encodeURIComponent(r.username)}`} className="text-accent underline-offset-2 hover:underline">
        @{r.username}
      </Link>
      <span className="text-muted">/</span>
      <a href={r.repoUrl} target="_blank" rel="noopener" className="text-accent underline-offset-2 hover:underline">
        {r.repo}
      </a>
    </span>
  );
}

function RemoveButton({ r, onRemove }: { r: Recipient; onRemove: (r: Recipient) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRemove(r)}
      aria-label={`Remove ${r.email}`}
      className="cursor-pointer rounded-lg border border-line px-3 py-1 text-sm transition hover:border-danger hover:text-danger"
    >
      Remove
    </button>
  );
}

/** Wider screens: a real table. */
function ListTable({
  rows,
  log,
  ticked,
  onTick,
  onTickAll,
  onRemove,
}: RowProps & { rows: Recipient[]; onTickAll: (on: boolean) => void }) {
  const tickedCount = rows.filter(ticked).length;
  return (
    <div className="mt-5 hidden overflow-hidden rounded-2xl border border-line bg-surface sm:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">People on your list, newest added first</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="w-10 py-2.5 pr-0 pl-4">
              <input
                type="checkbox"
                checked={tickedCount === rows.length}
                ref={(el) => {
                  if (el) el.indeterminate = tickedCount > 0 && tickedCount < rows.length;
                }}
                onChange={() => onTickAll(tickedCount !== rows.length)}
                aria-label={tickedCount === rows.length ? "Untick everyone shown" : "Tick everyone shown"}
                className="size-4 cursor-pointer accent-[var(--accent)]"
              />
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">Person</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Found in</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Added</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.email} className="align-top">
              <td className="py-3.5 pr-0 pl-4">
                <Tick r={r} ticked={ticked(r)} onTick={onTick} />
              </td>
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="block font-medium">{r.name}</span>
                <Email email={r.email} className="text-[13px] text-muted lg:whitespace-nowrap" />
                <AlreadyEmailed r={r} log={log} ticked={ticked(r)} />
              </th>
              <td className="px-4 py-3">
                <FoundIn r={r} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.addedAt)}</td>
              <td className="px-4 py-3">{statusText(r, log)}</td>
              <td className="px-4 py-2.5 text-right">
                <RemoveButton r={r} onRemove={onRemove} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phones: the same fields, in the same order, stacked. */
function ListCards({ rows, log, ticked, onTick, onRemove }: RowProps & { rows: Recipient[] }) {
  return (
    <ul className="mt-5 space-y-3 sm:hidden">
      {rows.map((r) => (
        <li key={r.email}>
          <Card>
            <div className="flex items-start gap-3">
              <div className="pt-0.5">
                <Tick r={r} ticked={ticked(r)} onTick={onTick} />
              </div>
              <div className="min-w-0">
                <p className="font-medium">{r.name}</p>
                <Email email={r.email} className="text-[13px] text-muted" />
                <AlreadyEmailed r={r} log={log} ticked={ticked(r)} />
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Found in</dt>
              <dd className="min-w-0">
                <FoundIn r={r} />
              </dd>
              <dt className="text-muted">Added</dt>
              <dd>{formatDate(r.addedAt)}</dd>
              <dt className="text-muted">Status</dt>
              <dd className="min-w-0 [overflow-wrap:anywhere]">{statusText(r, log)}</dd>
            </dl>
            <div className="mt-3">
              <RemoveButton r={r} onRemove={onRemove} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-12" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your list…
      </p>
      <div className="motion-safe:animate-pulse" aria-hidden>
        <Bone className="h-5 w-24" />
        <Bone className="mt-2 h-3.5 w-56" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Bone className="h-4 w-40" />
              <Bone className="mt-2 h-3 w-56" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- CSV ----

const CSV_COLUMNS = ["email", "name", "username", "repo", "repoUrl", "addedAt"] as const;

function csvCell(value: string) {
  // A leading = + - @ would run as a formula in spreadsheet apps; neutralise it.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Recipient[]) {
  const lines = [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","))];
  return lines.join("\r\n") + "\r\n";
}

function downloadCsv(rows: Recipient[]) {
  // The BOM makes Excel read names with accents as UTF-8.
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ping-list-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
