// Pure helpers for turning commits into email candidates. No I/O, safe to import anywhere.
import type { Commit } from "@/lib/github";

export type EmailKind = "personal" | "noreply" | "bot";

export type EmailCandidate = {
  email: string; // lowercased
  name: string; // most frequent author name for this address
  kind: EmailKind; // only "personal" can be added
  isUser: boolean; // linked to the looked-up login (vs. a collaborator)
  source: "commit" | "co-author" | "profile";
  commits: number; // commits that used this address
  lastSeen: string; // ISO date
  sha: string; // newest commit using it
  patchUrl: string; // https://github.com/o/r/commit/<sha>.patch
};

export const patchUrl = (fullName: string, sha: string) =>
  `https://github.com/${fullName}/commit/${sha}.patch`;

const BOT = /\[bot\]|dependabot|github-actions|renovate/i;
// AI coding agents credited in Co-authored-by trailers.
const AGENT_EMAIL = /^(codex@openai\.com|cursoragent@cursor\.com)$/;
const NO_REPLY_MAILBOX = /^(no-?reply|do-?not-?reply)@/;

export function classify(email: string, name = "", login = ""): EmailKind {
  const e = email.trim().toLowerCase();
  if (BOT.test(e) || BOT.test(name) || BOT.test(login) || AGENT_EMAIL.test(e)) return "bot";

  const domain = e.split("@")[1] ?? "";
  if (
    !domain.includes(".") ||
    NO_REPLY_MAILBOX.test(e) ||
    domain === "users.noreply.github.com" ||
    e === "noreply@github.com" ||
    domain === "localhost" ||
    domain.endsWith(".local")
  ) {
    return "noreply";
  }
  return "personal";
}

/** GitHub's own privacy addresses, as opposed to other kinds of unusable address. */
export const isGitHubNoreply = (email: string) =>
  /@users\.noreply\.github\.com$|^noreply@github\.com$/i.test(email);

/** The full written status of an address, as shown in the emails panel. */
export function statusLabel(email: string, kind: EmailKind): string {
  if (kind === "personal") return "Public email";
  if (kind === "bot") return "Bot: skipped";
  if (isGitHubNoreply(email)) return "Private: GitHub noreply, can't receive mail";
  return NO_REPLY_MAILBOX.test(email.toLowerCase())
    ? "No-reply address, can't receive mail"
    : "Not a real address, can't receive mail";
}

const CO_AUTHOR = /^co-authored-by:\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/gim;

export function parseCoAuthors(message: string): { name: string; email: string }[] {
  return [...message.matchAll(CO_AUTHOR)].map(([, name, email]) => ({
    name,
    email: email.toLowerCase(),
  }));
}

type Tally = {
  names: Map<string, number>;
  login: string;
  isUser: boolean;
  fromCommit: boolean;
  commits: number;
  lastSeen: string;
  sha: string;
};

export function collectCandidates({
  commits,
  username,
  fullName,
}: {
  commits: Commit[];
  username: string;
  fullName: string;
}): EmailCandidate[] {
  const user = username.toLowerCase();
  const tallies = new Map<string, Tally>();

  for (const c of commits) {
    const date = c.commit.author?.date ?? "";
    const seen = new Set<string>(); // count each address once per commit

    const note = (rawEmail: string, name: string, source: "commit" | "co-author", login = "") => {
      const email = rawEmail.trim().toLowerCase();
      if (!email || seen.has(email)) return;
      seen.add(email);

      let t = tallies.get(email);
      if (!t) {
        t = { names: new Map(), login: "", isUser: false, fromCommit: false, commits: 0, lastSeen: "", sha: "" };
        tallies.set(email, t);
      }
      if (name) t.names.set(name, (t.names.get(name) ?? 0) + 1);
      if (login) t.login ||= login;
      t.isUser ||= source === "commit" && login.toLowerCase() === user;
      t.fromCommit ||= source === "commit";
      t.commits++;
      // GitHub dates are all ISO 8601 UTC, so string order is time order.
      if (date >= t.lastSeen) {
        t.lastSeen = date;
        t.sha = c.sha;
      }
    };

    const author = c.commit.author;
    if (author?.email) note(author.email, author.name, "commit", c.author?.login ?? "");
    for (const co of parseCoAuthors(c.commit.message)) note(co.email, co.name, "co-author");
  }

  const candidates = [...tallies].map(([email, t]): EmailCandidate => {
    const name = [...t.names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? email;
    return {
      email,
      name,
      kind: classify(email, name, t.login),
      isUser: t.isUser,
      source: t.fromCommit ? "commit" : "co-author",
      commits: t.commits,
      lastSeen: t.lastSeen,
      sha: t.sha,
      patchUrl: patchUrl(fullName, t.sha),
    };
  });

  return candidates.sort(
    (a, b) =>
      Number(b.kind === "personal") - Number(a.kind === "personal") ||
      Number(b.isUser) - Number(a.isUser) ||
      b.commits - a.commits ||
      b.lastSeen.localeCompare(a.lastSeen),
  );
}
