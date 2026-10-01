// Pure email helpers shared by the compose preview (browser) and the sender (server), so the preview
// shows exactly what each person receives. No I/O.

export type RecipientFields = { name: string; username: string; repo: string; repoUrl: string };
export type TokenKey = "firstName" | "name" | "username" | "repo" | "repoUrl";

/** Tokens in the order the "Insert:" chips show them, with human labels. */
export const TOKENS: { key: TokenKey; label: string }[] = [
  { key: "firstName", label: "First name" },
  { key: "name", label: "Full name" },
  { key: "username", label: "Username" },
  { key: "repo", label: "Repo" },
  { key: "repoUrl", label: "Repo link" },
];

export const FIRST_NAME_FALLBACK = "there";

/** Token values for one person. A missing name (or one that's just the username) falls back to "there". */
export function personalise(r: RecipientFields): { values: Record<TokenKey, string>; fallbacks: TokenKey[] } {
  const name = (r.name ?? "").trim();
  const noRealName = !name || name.toLowerCase() === r.username.toLowerCase();
  const fallbacks: TokenKey[] = [];
  if (noRealName) fallbacks.push("firstName");
  if (!name) fallbacks.push("name");
  return {
    values: {
      firstName: noRealName ? FIRST_NAME_FALLBACK : name.split(/\s+/)[0],
      name: name || r.username,
      username: r.username,
      repo: r.repo,
      repoUrl: r.repoUrl,
    },
    fallbacks,
  };
}

export type Part = { text: string; kind: "plain" | "value" | "fallback" | "unknown" | "placeholder"; token?: string };

/** The line in the default template that the sender must replace, so nobody sends a hollow email. */
export const PLACEHOLDER_START = "[Say why you're writing";
const PLACEHOLDER_RE = /\[Say why you're writing[^\]\n]*\]?/g;
export const hasPlaceholder = (text: string) => text.includes(PLACEHOLDER_START);

const TOKEN_RE = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;
const KEY = new Map(TOKENS.map((t) => [t.key.toLowerCase(), t.key]));

/** The template split into plain text, filled-in values, fallbacks and unknown tokens (for highlighting). */
export function renderParts(template: string, r: RecipientFields): Part[] {
  // The placeholder line is shown as one highlighted part, with its tokens filled in.
  const out: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    out.push(...renderTokens(template.slice(last, m.index), r));
    out.push({ text: renderTokens(m[0], r).map((p) => p.text).join(""), kind: "placeholder" });
    last = m.index + m[0].length;
  }
  out.push(...renderTokens(template.slice(last), r));
  return out;
}

function renderTokens(template: string, r: RecipientFields): Part[] {
  const { values, fallbacks } = personalise(r);
  const parts: Part[] = [];
  let last = 0;
  for (const m of template.matchAll(TOKEN_RE)) {
    if (m.index > last) parts.push({ text: template.slice(last, m.index), kind: "plain" });
    const key = KEY.get(m[1].toLowerCase());
    if (key) parts.push({ text: values[key], kind: fallbacks.includes(key) ? "fallback" : "value", token: key });
    else parts.push({ text: m[0], kind: "unknown", token: m[0] });
    last = m.index + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last), kind: "plain" });
  return parts;
}

export function render(template: string, r: RecipientFields): { text: string; unknown: string[]; fallbacks: TokenKey[] } {
  const parts = renderParts(template, r);
  return {
    text: parts.map((p) => p.text).join(""),
    unknown: [...new Set(parts.filter((p) => p.kind === "unknown").map((p) => p.text))],
    fallbacks: [...new Set(parts.filter((p) => p.kind === "fallback").map((p) => p.token as TokenKey))],
  };
}

/** Every {{token}} that isn't one of TOKENS, e.g. a typo like {{compnay}}. */
export function unknownTokens(...texts: string[]): string[] {
  const found = texts.flatMap((t) => [...t.matchAll(TOKEN_RE)].filter((m) => !KEY.has(m[1].toLowerCase())).map((m) => m[0]));
  return [...new Set(found)];
}

export function hasOptOut(body: string): boolean {
  return /rather not hear|unsubscribe|opt[\s-]?out|won['’]t (e-?mail|write|contact)|not interested/i.test(body);
}

/** "Dan Abramov <dan@example.com>" → "Dan Abramov"; a bare address → "". */
export function fromName(mailFrom: string | null | undefined): string {
  const m = (mailFrom ?? "").match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  return m ? m[1].trim() : "";
}

/** "Dan Abramov <dan@example.com>" → "dan@example.com". */
export function fromAddress(mailFrom: string | null | undefined): string {
  const s = (mailFrom ?? "").trim();
  return s.match(/<([^>]+)>/)?.[1].trim() ?? s;
}

export function defaultDraft(senderName: string): { subject: string; body: string } {
  return {
    subject: "Saw {{repo}} on GitHub",
    body:
      "Hi {{firstName}},\n\nI came across {{repo}} ({{repoUrl}}) and wanted to reach out.\n\n" +
      "[Say why you're writing: what you liked about {{repo}}, or what you'd like to ask]\n\nBest,\n" +
      `${senderName}\n\nIf you'd rather not hear from me, just reply and I won't email again.`,
  };
}

// ---- Validation (used by the server before every send) ----

export const MAX_SUBJECT = 200;
export const MAX_BODY_BYTES = 20 * 1024;
const EMAIL_RE = /^[^\s@<>()[\]",;:\\]+@[^\s@<>()[\]",;:\\]+\.[^\s@<>()[\]",;:\\]{2,}$/;

export const isEmail = (s: string) => EMAIL_RE.test(s.trim());
/** Header injection guard: a subject is one line. */
export const cleanSubject = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();

export type SendErrorKind = "auth" | "limit" | "recipient" | "network" | "other";
export type SendError = { kind: SendErrorKind; message: string };

/**
 * Checks a message before it's sent. Run it on the template (catches unknown tokens) and again on the
 * personalised text with { checkTokens: false } (someone's repo name may contain braces).
 */
export function validateMessage(
  m: { to: string; subject: string; body: string },
  { checkTokens = true }: { checkTokens?: boolean } = {},
): { ok: true; to: string; subject: string; body: string } | { ok: false; error: SendError } {
  const to = m.to.trim();
  if (!isEmail(to)) return { ok: false, error: { kind: "recipient", message: `"${to}" isn't a valid email address.` } };
  const subject = cleanSubject(m.subject);
  if (!subject) return { ok: false, error: { kind: "other", message: "The subject is empty." } };
  if (subject.length > MAX_SUBJECT) {
    return { ok: false, error: { kind: "other", message: `The subject is longer than ${MAX_SUBJECT} characters.` } };
  }
  if (!m.body.trim()) return { ok: false, error: { kind: "other", message: "The message is empty." } };
  if (new TextEncoder().encode(m.body).length > MAX_BODY_BYTES) {
    return { ok: false, error: { kind: "other", message: "The message is longer than 20 KB." } };
  }
  if (checkTokens && hasPlaceholder(m.body)) {
    return { ok: false, error: { kind: "other", message: "Replace the [Say why you're writing…] line with your own words." } };
  }
  const unknown = checkTokens ? unknownTokens(m.subject, m.body) : [];
  if (unknown.length) {
    return { ok: false, error: { kind: "other", message: `Unknown ${unknown.length === 1 ? "token" : "tokens"}: ${unknown.join(", ")}.` } };
  }
  return { ok: true, to, subject, body: m.body };
}

// ---- SMTP errors in plain words ----

const NETWORK_CODES = new Set([
  "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH",
]);

export function classifySmtpError(e: unknown): SendError {
  const err = (e ?? {}) as { code?: string; responseCode?: number; response?: string; message?: string };
  const code = err.code ?? "";
  const status = err.responseCode ?? 0;
  const text = `${err.response ?? ""} ${err.message ?? ""}`;

  if (code === "EAUTH" || [530, 534, 535].includes(status)) {
    return { kind: "auth", message: "Gmail rejected the login. Check SMTP_USER and the App Password in .env.local." };
  }
  if (/5\.4\.5|sending limit|daily .*limit|quota|rate limit|too many|try again later/i.test(text) || (status === 421 && /4\.7\./.test(text))) {
    return {
      kind: "limit",
      message: "Gmail's sending limit is reached. Wait before sending more (personal Gmail allows about 500 emails a day).",
    };
  }
  if (code === "EENVELOPE" || ([550, 551, 553].includes(status) && /5\.1\.|recipient|mailbox|address|user unknown|does not exist/i.test(text))) {
    return { kind: "recipient", message: "Gmail refused this address. It may not exist." };
  }
  if (NETWORK_CODES.has(code)) {
    return { kind: "network", message: "Couldn't reach Gmail's mail server. Check your internet connection, then resume." };
  }
  const detail = (err.message ?? String(e ?? "")).trim().slice(0, 160);
  return { kind: "other", message: detail ? `Sending failed: ${detail}` : "Sending failed for an unknown reason." };
}

/** These mean every following send would fail too, so the batch stops. */
export const stopsBatch = (kind: SendErrorKind) => kind === "auth" || kind === "limit" || kind === "network";

/** Rough time for a batch: about 1.5 s per send plus the gap between sends. */
export function estimateSeconds(count: number, gapSeconds = 4): number {
  return count <= 0 ? 0 : Math.round(count * 1.5 + (count - 1) * gapSeconds);
}

export function describeDuration(seconds: number): string {
  if (seconds < 60) return `about ${Math.max(1, seconds)} ${seconds === 1 ? "second" : "seconds"}`;
  const mins = Math.round(seconds / 60);
  return `about ${mins} ${mins === 1 ? "minute" : "minutes"}`;
}
