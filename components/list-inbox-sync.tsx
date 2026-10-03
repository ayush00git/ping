"use client";

import { useEffect } from "react";
import { useShortlist, type Recipient } from "@/lib/shortlist";

const CURSOR_KEY = "ping:inbox-cursor:v1";
const POLL_MS = 3000;

/**
 * Adds people that the MCP server's add_to_list tool queued (lib/list-inbox.ts) to this browser's
 * list. Renders nothing. Polls only while the tab is visible; the cursor is shared across tabs, and
 * the list is keyed by email, so two open tabs never add someone twice.
 */
export default function ListInboxSync() {
  const { restore } = useShortlist();

  useEffect(() => {
    let stopped = false;
    let busy = false;

    const pull = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/api/list-inbox?after=${encodeURIComponent(readCursor())}`, { cache: "no-store" });
        if (!res.ok || stopped) return;
        const { items } = (await res.json()) as { items: Recipient[] };
        for (const r of items) restore({ ...r, status: "ready" });
        const last = items.reduce((max, r) => (r.addedAt > max ? r.addedAt : max), "");
        if (last) writeCursor(last);
      } catch {
        // Server restarting or offline: the next poll tries again.
      } finally {
        busy = false;
      }
    };

    void pull();
    const timer = setInterval(pull, POLL_MS);
    document.addEventListener("visibilitychange", pull);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [restore]);

  return null;
}

function readCursor() {
  try {
    return localStorage.getItem(CURSOR_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeCursor(at: string) {
  try {
    localStorage.setItem(CURSOR_KEY, at);
  } catch {
    // Storage unavailable: the list itself is memory-only then, and restore() skips repeats.
  }
}
