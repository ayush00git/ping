"use client";

// The recipient list, saved in this browser's localStorage and shared across tabs.
import { useMemo, useSyncExternalStore } from "react";
import type { EmailCandidate } from "@/lib/emails";

export type Recipient = {
  email: string;
  name: string;
  username: string;
  repo: string;
  repoUrl: string;
  addedAt: string;
  status: "ready" | "sending" | "sent" | "failed";
  sentAt?: string;
  error?: string;
};

export type AddContext = { username: string; repo: string; repoUrl: string };

const KEY = "ping:shortlist:v1";
const EMPTY: Recipient[] = [];
const listeners = new Set<() => void>();

// Parsed once per stored string, so useSyncExternalStore sees a stable array between changes.
let cache: { raw: string | null; items: Recipient[] } = { raw: null, items: EMPTY };
// Set when localStorage is unavailable (private mode, quota): the list then lives in memory only.
let memoryOnly = false;

function read(): Recipient[] {
  if (memoryOnly) return cache.items;
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    memoryOnly = true;
    return cache.items;
  }
  if (raw === cache.raw) return cache.items;

  let items = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      items = parsed.filter((r): r is Recipient => typeof r?.email === "string" && typeof r?.name === "string");
    }
  } catch {
    // Corrupt value: start from an empty list.
  }
  cache = { raw, items };
  return items;
}

function write(items: Recipient[]) {
  const raw = JSON.stringify(items);
  cache = { raw, items };
  if (!memoryOnly) {
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      memoryOnly = true;
    }
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  // Other tabs changing the list.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** Keyed by email: adding an address that's already in the list does nothing. */
function add(c: EmailCandidate, ctx: AddContext) {
  if (c.kind !== "personal") return;
  const items = read();
  if (items.some((r) => r.email === c.email)) return;
  write([
    ...items,
    { email: c.email, name: c.name, ...ctx, addedAt: new Date().toISOString(), status: "ready" },
  ]);
}

function remove(email: string) {
  write(read().filter((r) => r.email !== email));
}

function clear() {
  write(EMPTY);
}

export function useShortlist() {
  // The server has no list; the real one appears right after hydration.
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  return useMemo(
    () => ({ items, has: (email: string) => items.some((r) => r.email === email), add, remove, clear }),
    [items],
  );
}
