// The way into the recipient list from outside the browser. The list lives in the browser's
// localStorage, so the MCP server can't add to it directly: it appends here, and every open ping page
// picks up new entries (components/list-inbox-sync.tsx) and adds them to its list.
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Recipient } from "./shortlist.ts"; // type only: erased, so tests never load React

/** One JSON line per added person, oldest first. Append-only: the browser keeps its own cursor. */
export const inboxPath = () => path.join(process.cwd(), ".ping", "list-inbox.jsonl");

const isRecipient = (v: unknown): v is Recipient => {
  const r = v as Recipient | null;
  return typeof r?.email === "string" && typeof r.name === "string" && typeof r.addedAt === "string";
};

export async function readInbox(file = inboxPath()): Promise<Recipient[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return raw.split("\n").flatMap((line) => {
    try {
      const v: unknown = JSON.parse(line);
      return isRecipient(v) ? [v] : [];
    } catch {
      return []; // Blank or half-written line.
    }
  });
}

export async function appendToInbox(r: Recipient, file = inboxPath()) {
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(r) + "\n");
}

/** Entries added after `cursor` (an addedAt). ISO 8601 UTC dates, so string order is time order. */
export const newerThan = (items: Recipient[], cursor: string) => items.filter((r) => r.addedAt > cursor);
