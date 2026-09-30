"use client";

import type { EmailCandidate } from "@/lib/emails";
import { useShortlist, type AddContext } from "@/lib/shortlist";

export default function AddToggle({ candidate, ctx }: { candidate: EmailCandidate; ctx: AddContext }) {
  const { has, add, remove } = useShortlist();
  const added = has(candidate.email);

  return (
    <button
      type="button"
      aria-pressed={added}
      aria-label={`Yes, add ${candidate.email} to your list`}
      onClick={() => (added ? remove(candidate.email) : add(candidate, ctx))}
      className={`group shrink-0 cursor-pointer rounded-xl px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition active:scale-[.97] ${
        added
          ? "border border-line bg-bg text-ink hover:border-danger hover:text-danger"
          : "bg-accent text-white hover:opacity-90 dark:text-bg"
      }`}
    >
      {added ? (
        <>
          {/* Pressing it again removes; say so on hover and keyboard focus. */}
          <span className="group-hover:hidden group-focus-visible:hidden">Added ✓</span>
          <span className="hidden group-hover:inline group-focus-visible:inline">Remove</span>
        </>
      ) : (
        "Yes, add"
      )}
    </button>
  );
}
