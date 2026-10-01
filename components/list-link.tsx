"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHydrated, useShortlist } from "@/lib/shortlist";

/** "Your list · N". The count appears only once the saved list is loaded, so it never flashes 0. */
export default function ListLink({ onlyWhenNonEmpty = false }: { onlyWhenNonEmpty?: boolean }) {
  const { items } = useShortlist();
  const hydrated = useHydrated();
  const here = usePathname() === "/list";

  if (onlyWhenNonEmpty && (!hydrated || items.length === 0)) return null;
  return (
    <Link
      href="/list"
      aria-current={here ? "page" : undefined}
      className="text-sm whitespace-nowrap text-accent underline-offset-4 hover:underline aria-[current=page]:text-ink aria-[current=page]:no-underline"
    >
      Your list
      {hydrated && <span className="text-muted"> · {items.length}</span>}
    </Link>
  );
}
