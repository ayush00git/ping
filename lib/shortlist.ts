"use client";

// Browser-side state: the recipient list and sent log (localStorage, shared across tabs), the current
// selection (sessionStorage, this tab only) and the draft (localStorage).
import { useMemo, useSyncExternalStore } from "react";
import type { EmailCandidate } from "@/lib/emails";
import { logSend, setSelection, withStatus, type SelectionOverrides, type SentLog, type StatusExtra } from "@/lib/outbox";

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
  dryRun?: boolean; // the last "sent" was a dry run: logged on the server, not delivered
};

export type AddContext = { username: string; repo: string; repoUrl: string };
export type Draft = { subject: string; body: string };

/**
 * One JSON value in web storage, as an external store for useSyncExternalStore. It's parsed once per
 * stored string so snapshots stay stable, and falls back to memory when storage is unavailable.
 */
function storedValue<T>(area: "local" | "session", key: string, empty: T, valid: (v: unknown) => v is T) {
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T } = { raw: null, value: empty };
  let memoryOnly = false;
  const storage = () => (area === "local" ? localStorage : sessionStorage);

  function read(): T {
    if (memoryOnly) return cache.value;
    let raw: string | null;
    try {
      raw = storage().getItem(key);
    } catch {
      memoryOnly = true;
      return cache.value;
    }
    if (raw === cache.raw) return cache.value;
    let value = empty;
    try {
      const parsed: unknown = raw ? JSON.parse(raw) : empty;
      if (valid(parsed)) value = parsed;
    } catch {
      // Corrupt value: start from empty.
    }
    cache = { raw, value };
    return value;
  }

  function write(value: T) {
    const raw = JSON.stringify(value);
    cache = { raw, value };
    if (!memoryOnly) {
      try {
        storage().setItem(key, raw);
      } catch {
        memoryOnly = true;
      }
    }
    listeners.forEach((notify) => notify());
  }

  function subscribe(notify: () => void) {
    listeners.add(notify);
    // Other tabs changing the value (localStorage only fires this across tabs).
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) notify();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(notify);
      window.removeEventListener("storage", onStorage);
    };
  }

  const useValue = (serverValue: T = empty) => useSyncExternalStore(subscribe, read, () => serverValue);
  return { read, write, useValue };
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// ---- The list ----

const EMPTY: Recipient[] = [];
const list = storedValue<Recipient[]>("local", "ping:shortlist:v1", EMPTY, (v): v is Recipient[] =>
  Array.isArray(v) && v.every((r) => typeof r?.email === "string" && typeof r?.name === "string"),
);

/** Keyed by email: adding an address that's already in the list does nothing. */
function add(c: EmailCandidate, ctx: AddContext) {
  if (c.kind !== "personal") return;
  const items = list.read();
  if (items.some((r) => r.email === c.email)) return;
  list.write([...items, { email: c.email, name: c.name, ...ctx, addedAt: new Date().toISOString(), status: "ready" }]);
}

/** Puts a removed recipient back exactly as it was (same addedAt). Still keyed by email. */
function restore(r: Recipient) {
  const items = list.read();
  if (items.some((x) => x.email === r.email)) return;
  list.write([...items, r]);
}

function remove(email: string) {
  list.write(list.read().filter((r) => r.email !== email));
}

function clear() {
  list.write(EMPTY);
}

/** Records a send result on the person, and in the sent log when it went out (or was logged in a dry run). */
function setStatus(email: string, status: Recipient["status"], extra: StatusExtra = {}) {
  list.write(withStatus(list.read(), email, status, extra));
  if (status === "sent") {
    sent.write(logSend(sent.read(), email, extra.sentAt ?? new Date().toISOString(), !!extra.dryRun));
  }
}

export function useShortlist() {
  // The server has no list; the real one appears right after hydration.
  const items = list.useValue();
  return useMemo(
    () => ({ items, has: (email: string) => items.some((r) => r.email === email), add, remove, restore, clear, setStatus }),
    [items],
  );
}

// ---- Sent log: survives remove and clear, so nobody gets a second email by accident ----

const NO_LOG: SentLog = {};
const sent = storedValue<SentLog>("local", "ping:sent:v1", NO_LOG, (v): v is SentLog =>
  isObject(v) && Object.values(v).every((e) => isObject(e) && typeof e.at === "string"),
);
export const useSentLog = () => sent.useValue();

// ---- Selection for the next email (this tab only) ----

const NO_OVERRIDES: SelectionOverrides = {};
const selection = storedValue<SelectionOverrides>("session", "ping:selection:v1", NO_OVERRIDES, (v): v is SelectionOverrides =>
  isObject(v) && Object.values(v).every((b) => typeof b === "boolean"),
);

export function useSelection() {
  const overrides = selection.useValue();
  return useMemo(
    () => ({
      overrides,
      set: (emails: string[], on: boolean) => selection.write(setSelection(selection.read(), emails, on)),
      /** Back to the default: everyone not yet emailed. */
      reset: () => selection.write(NO_OVERRIDES),
    }),
    [overrides],
  );
}

// ---- Draft ----

const draft = storedValue<Draft | null>("local", "ping:draft:v1", null, (v): v is Draft | null =>
  v === null || (isObject(v) && typeof v.subject === "string" && typeof v.body === "string"),
);
export const useDraft = () => [draft.useValue(), draft.write] as const;

const noop = () => () => {};
/** False on the server and during hydration, true once mounted: tells "not loaded yet" from "empty". */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}
