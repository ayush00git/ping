"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useShortlist } from "@/lib/shortlist";
import { Email } from "@/components/ui";
import { SHELL } from "@/components/layout";

export default function RecipientsTray() {
  const { items, remove, clear } = useShortlist();
  const [open, setOpen] = useState(false);

  // Sticky side columns shrink by this much so the fixed tray never hides their end.
  useEffect(() => {
    if (items.length === 0) return;
    document.documentElement.style.setProperty("--tray-space", "6rem");
    return () => {
      document.documentElement.style.removeProperty("--tray-space");
    };
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <>
      {/* Keeps the end of the page reachable above the fixed bar. */}
      <div aria-hidden className="h-24" />

      <section
        aria-label="Your list"
        className="fixed inset-x-0 bottom-0 z-10 pb-3 sm:pb-4"
      >
        <div className={SHELL}>
          <div className="rounded-2xl border border-line bg-surface shadow-[0_8px_30px_rgb(0_0_0/0.10)]">
            {open && (
              <div id="tray-list" className="border-b border-line">
                <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto px-4 sm:px-5">
                  {items.map((r) => (
                    <li key={r.email} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Email email={r.email} className="block text-sm" />
                        <p className="mt-0.5 text-[13px] text-muted">
                          {r.name} · from @{r.username}/{r.repo}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(r.email)}
                        aria-label={`Remove ${r.email}`}
                        className="shrink-0 cursor-pointer rounded-lg border border-line px-3 py-1 text-sm transition hover:border-danger hover:text-danger"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-muted sm:px-5">
                  <span>Saved in this browser only.</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove all ${items.length} from your list?`)) {
                        clear();
                        setOpen(false);
                      }
                    }}
                    className="cursor-pointer rounded-lg px-2 py-1 transition hover:text-danger"
                  >
                    Clear list
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 py-2.5 pr-2.5 pl-4 sm:pl-5">
              <p className="text-sm">
                <span className="font-semibold">{items.length}</span> in your list
              </p>
              <div className="flex items-center gap-3">
                <Link href="/list" className="text-sm text-accent underline-offset-4 hover:underline">
                  Open list
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  aria-expanded={open}
                  aria-controls="tray-list"
                  className="cursor-pointer rounded-xl border border-line px-3.5 py-1.5 text-sm transition hover:border-accent hover:text-accent"
                >
                  {open ? "Hide list" : "Show list"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
