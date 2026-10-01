"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useHydrated, useShortlist, type Recipient } from "@/lib/shortlist";
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

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function ListManager() {
  const { items, remove, restore, clear } = useShortlist();
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

  const actions = (
    <div className="ml-auto flex gap-2">
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
              <ListTable rows={rows} onRemove={onRemove} />
              <ListCards rows={rows} onRemove={onRemove} />
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
function ListTable({ rows, onRemove }: { rows: Recipient[]; onRemove: (r: Recipient) => void }) {
  return (
    <div className="mt-5 hidden overflow-hidden rounded-2xl border border-line bg-surface sm:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">People on your list, newest added first</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
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
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="block font-medium">{r.name}</span>
                <Email email={r.email} className="text-[13px] text-muted lg:whitespace-nowrap" />
              </th>
              <td className="px-4 py-3">
                <FoundIn r={r} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.addedAt)}</td>
              <td className="px-4 py-3">{STATUS[r.status]}</td>
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
function ListCards({ rows, onRemove }: { rows: Recipient[]; onRemove: (r: Recipient) => void }) {
  return (
    <ul className="mt-5 space-y-3 sm:hidden">
      {rows.map((r) => (
        <li key={r.email}>
          <Card>
            <p className="font-medium">{r.name}</p>
            <Email email={r.email} className="text-[13px] text-muted" />
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Found in</dt>
              <dd className="min-w-0">
                <FoundIn r={r} />
              </dd>
              <dt className="text-muted">Added</dt>
              <dd>{formatDate(r.addedAt)}</dd>
              <dt className="text-muted">Status</dt>
              <dd>{STATUS[r.status]}</dd>
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
