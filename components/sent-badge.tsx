"use client";

import { useSentLog } from "@/lib/shortlist";
import { formatDate } from "@/components/format";

/** "Emailed Oct 1, 2026" next to an address that's already been emailed, so nobody gets a second one by accident. */
export default function SentBadge({ email }: { email: string }) {
  const entry = useSentLog()[email];
  if (!entry) return null;
  return entry.dryRun ? (
    <span className="rounded-md border border-line px-1.5 py-px text-xs text-muted">
      Dry run {formatDate(entry.at)} · not sent
    </span>
  ) : (
    <span className="rounded-md bg-accent-soft px-1.5 py-px text-xs text-accent">Emailed {formatDate(entry.at)}</span>
  );
}
