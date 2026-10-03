// Tool results as text, in the web app's words: the same labels, empty states, evidence and errors.
import { AUTHOR_COMMITS_LIMIT, GitHubError, NetworkError } from "@/lib/github";
import { isGitHubNoreply, statusLabel, type EmailCandidate } from "@/lib/emails";
import { linkedInUrl, parseLinkedInUrl, primaryIndex, type Hints, type LinkedInUrl, type Tier } from "@/lib/linkedin";
import type { FindResult, Found, Source } from "@/lib/resolve";
import { formatDate } from "@/components/format";
import { LimitReached } from "./budget";
import type { Lookup } from "./lookup";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const clock = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- Input ----

const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;

/** "vihar", "@vihar" or a github.com/vihar URL → "vihar". Null when it isn't a GitHub username. */
export function parseUsername(input: string): string | null {
  const s = input.trim().replace(/^@/, "");
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)/i);
  const login = url ? url[1] : s;
  return GITHUB_LOGIN.test(login) ? login : null;
}

export function notAUsername(input: string) {
  return parseLinkedInUrl(input)
    ? "That's a LinkedIn URL. Use find_github_from_linkedin to find their GitHub account first."
    : `"${input}" isn't a GitHub username.`;
}

/** Why a LinkedIn URL can't be searched (app/find/page.tsx). */
export function linkedInProblem(parsed: LinkedInUrl | null) {
  const what = !parsed
    ? "That isn't a LinkedIn URL."
    : parsed.kind === "not-profile" && parsed.page === "company"
      ? "That's a company page."
      : parsed.kind === "not-profile" && parsed.page === "school"
        ? "That's a school page."
        : "That isn't a person's LinkedIn profile.";
  return `${what} Pass a person's profile URL, linkedin.com/in/…`;
}

// ---- lookup_emails (components/results.tsx, components/emails-panel.tsx) ----

export function formatLookup({ login, repo, candidates, scanned }: Lookup): string {
  if (!repo) {
    return `@${login} has no public repositories of their own. Forks are skipped, so a user who only has forks shows up here too.`;
  }

  const lines = [
    `@${login} · repository ${repo.full_name} (${repo.html_url}), created ${formatDate(repo.created_at)}.`,
    "Why this repo: most recently created repository (forks skipped).",
    "",
  ];
  if (scanned === 0) {
    lines.push(`GitHub has no commits by @${login} in ${repo.name}, so there are no emails. Only commits by @${login} are read.`);
    return lines.join("\n");
  }

  const which = scanned === AUTHOR_COMMITS_LIMIT ? `the last ${scanned}` : `all ${scanned}`;
  const coAuthors = candidates.some((c) => c.source === "co-author") ? ", including co-authors they credited" : "";
  lines.push(
    `Emails found: ${plural(candidates.length, "address", "addresses")} from ${which} ${scanned === 1 ? "commit" : "commits"} by @${login} in ${repo.name}${coAuthors}.`,
  );

  const usable = candidates.filter((c) => c.kind === "personal");
  const unusable = candidates.filter((c) => c.kind !== "personal");
  const own = candidates.filter((c) => c.isUser);

  lines.push("", `Can receive mail · ${usable.length}`);
  if (usable.length === 0) {
    lines.push(
      own.length > 0 && own.every((c) => isGitHubNoreply(c.email))
        ? `No public email. @${login} commits with GitHub's private noreply address.`
        : "None of these addresses can receive mail. The reason is next to each one.",
    );
  }
  for (const c of usable) lines.push(`- ${emailRow(c)} · ${c.patchUrl}`);

  if (unusable.length > 0) {
    lines.push("", `Can't receive mail · ${unusable.length}`);
    for (const c of unusable) lines.push(`- ${emailRow(c)} · ${statusLabel(c.email, c.kind)}`);
  }

  if (usable.length > 0) {
    lines.push("", `To put an address on the list, call add_to_list with username "${login}" and that email.`);
  }
  return lines.join("\n");
}

function emailRow(c: EmailCandidate) {
  const last = c.lastSeen ? `, last ${formatDate(c.lastSeen)}` : "";
  const coAuthor = c.source === "co-author" ? " · co-author they credited" : "";
  return `${c.email} · ${c.name} · ${plural(c.commits, "commit")}${last}${coAuthor}`;
}

// ---- find_github_from_linkedin (components/finder-results.tsx) ----

const GROUPS: { tier: Exclude<Tier, "ruled-out">; title: string; about: string }[] = [
  { tier: "confirmed", title: "Confirmed", about: "Their own GitHub profile links to this LinkedIn profile." },
  { tier: "likely", title: "Likely", about: "A repo of theirs links to it, or the full name and another detail match." },
  { tier: "possible", title: "Possible", about: "Only the name matches." },
];

const FOUND_BY: Record<Source, string> = {
  link: "a search for this LinkedIn URL",
  name: "the name search",
  guess: "a username guess",
};

const MARK = { for: "✓", against: "✗", info: "–" } as const;

export function formatFind(slug: string, hints: Hints, nameFromUrl: string | null, result: FindResult): string {
  const { found, skipped, requests, nameTotal, detailsNeeded } = result;
  const lines = [`LinkedIn profile: ${linkedInUrl(slug)}`];
  lines.push(
    !hints.name
      ? "This URL has no name in it, and no name was given."
      : hints.name === nameFromUrl
        ? `Name read from the URL: ${hints.name}`
        : `Name: ${hints.name}`,
  );
  const details = [
    hints.company && `company ${hints.company}`,
    hints.city && `city ${hints.city}`,
    hints.school && `college ${hints.school}`,
  ].filter(Boolean);
  if (details.length > 0) lines.push(`Details given: ${details.join(", ")}.`);

  lines.push("", scopeLine(result, hints));
  if (detailsNeeded > 1 && nameTotal !== null) {
    lines.push(`${hints.name} is a common name (${plural(nameTotal, "GitHub account")}), so Likely needs two matching details.`);
  }
  lines.push(...skipped);

  const shown = found.filter((f) => f.tier !== "ruled-out");
  const ruledOut = found.filter((f) => f.tier === "ruled-out");
  // The web app fills the "This is them" button for at most one account; a tie means nobody.
  const primaryAt = primaryIndex(found.map((f) => f.tier));
  const primary = primaryAt === null ? null : found[primaryAt].user.login;

  if (shown.length === 0) {
    lines.push(
      "",
      "No GitHub account found.",
      ruledOut.length > 0
        ? "The only matches link to a different LinkedIn profile. They're listed under Ruled out."
        : "They may not have one, or use a different name there.",
    );
  }
  for (const { tier, title, about } of GROUPS) {
    const inTier = shown.filter((f) => f.tier === tier);
    if (inTier.length === 0) continue;
    lines.push("", `${title} · ${inTier.length}: ${about}`);
    if (tier !== "possible" && inTier.length > 1) {
      lines.push(`${inTier.length} accounts match equally. Compare them before choosing.`);
    }
    for (const f of inTier) lines.push(...accountLines(f, f.user.login === primary));
  }
  if (ruledOut.length > 0) {
    lines.push("", `Ruled out · ${ruledOut.length}: Their GitHub profile links to a different LinkedIn profile.`);
    for (const f of ruledOut) lines.push(...accountLines(f, false));
  }

  lines.push("", `This search made ${plural(requests, "GitHub API request")}.`);
  if (shown.length > 0) {
    lines.push(
      "Don't choose for the user: show them these accounts with their evidence and let them say which one is the person. Then call lookup_emails with that username.",
    );
  }
  return lines.join("\n");
}

function scopeLine({ found, checked, nameTotal }: FindResult, hints: Hints) {
  const total = checked.link + checked.name + checked.guess;
  const parts: string[] = [];
  if (checked.link) parts.push(`${checked.link} from a search for this LinkedIn URL`);
  if (checked.name) {
    const of = nameTotal && nameTotal > checked.name ? ` (out of ${plural(nameTotal, "GitHub account")} with this name)` : "";
    parts.push(`${checked.name} from a name search${of}`);
  }
  if (checked.guess) parts.push(`${checked.guess} from username ${checked.guess === 1 ? "guess" : "guesses"}`);

  const noName = hints.name ? "" : " There was no name search because no name is given.";
  if (total === 0) return `No accounts to check.${noName}`;
  const ruledOut = found.filter((f) => f.tier === "ruled-out").length;
  const showing = `Showing ${found.length - ruledOut}${ruledOut ? `, and ${ruledOut} ruled out` : ""}`;
  return `Checked ${plural(total, "account")}: ${parts.join(", ")}. ${showing}.${noName}`;
}

function accountLines(f: Found, primary: boolean): string[] {
  const u = f.user;
  const meta = [u.name, u.company, u.location].filter(Boolean).join(" · ");
  return [
    `- @${u.login}${meta ? ` · ${meta}` : ""} · ${u.html_url}${primary ? " · best match" : ""}`,
    ...(u.bio ? [`  Bio: ${oneLine(u.bio)}`] : []),
    ...f.evidence.map((e) => `  ${MARK[e.tone]} ${e.text}`),
    `  Found by ${FOUND_BY[f.source]}.`,
    ...(f.warning ? [`  ${f.warning}`] : []),
  ];
}

// ---- Errors (components/lookup-error.tsx) ----

export function errorText(
  error: unknown,
  { username, subject = `@${username}`, rateLimitNote }: { username: string; subject?: string; rateLimitNote?: string },
): string {
  if (error instanceof LimitReached) {
    const mins = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 60000));
    return `ping's MCP server allows ${error.max} ${error.what} an hour, so people are looked up one at a time rather than in bulk. The next one is possible at ${clock(error.retryAt)} (in about ${plural(mins, "minute")}).`;
  }

  if (error instanceof GitHubError && error.status === 404) {
    return `No GitHub user named @${username}. Check the spelling and try again.`;
  }

  if (error instanceof GitHubError && error.rateLimited) {
    const mins = error.minutesToReset;
    const when =
      error.resetAt && mins
        ? `Lookups work again at ${clock(error.resetAt)} (in about ${plural(mins, "minute")}).`
        : "Try again in a few minutes.";
    const token = process.env.GITHUB_TOKEN
      ? "This server already uses a GITHUB_TOKEN, which allows 5,000 requests per hour."
      : "Without a token GitHub allows 60 requests per hour, and each lookup uses about 3. Add GITHUB_TOKEN to .env.local and restart the MCP server to raise the limit to 5,000.";
    return [`GitHub's rate limit is reached. ${when}`, rateLimitNote, token].filter(Boolean).join(" ");
  }

  if (error instanceof GitHubError) return `GitHub returned an error: ${error.message} (HTTP ${error.status}).`;
  if (error instanceof NetworkError) return "Couldn't reach GitHub. Check your internet connection, then try again.";

  // A bug on our side. Log it (to stderr: stdout carries the protocol) so it isn't swallowed.
  console.error(error);
  return `Something went wrong while looking up ${subject}.`;
}
