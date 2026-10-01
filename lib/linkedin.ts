// Pure helpers for the LinkedIn → GitHub finder. No I/O: ping never requests anything from linkedin.com.

export type LinkedInUrl =
  | { kind: "profile"; slug: string }
  | { kind: "not-profile"; page: "company" | "school" | "other" };

/**
 * Reads a LinkedIn URL. Returns null when the input isn't a LinkedIn URL at all, so callers can
 * treat it as something else (a GitHub username).
 */
export function parseLinkedInUrl(input: string): LinkedInUrl | null {
  let s = input.trim();
  if (!s) return null;
  if (/^\/?in\//i.test(s)) s = `linkedin.com/${s.replace(/^\//, "")}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;

  const [section = "", raw] = url.pathname.split("/").filter(Boolean);
  const kind = section.toLowerCase();
  if (kind === "in" && raw) {
    const slug = normaliseSlug(raw);
    return slug ? { kind: "profile", slug } : { kind: "not-profile", page: "other" };
  }
  return { kind: "not-profile", page: kind === "company" ? "company" : kind === "school" ? "school" : "other" };
}

/** Percent-decoded, lowercased profile slug, or null if it isn't a plausible one. */
export function normaliseSlug(raw: string): string | null {
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    // Keep the raw value; the check below decides.
  }
  s = s.normalize("NFC").toLowerCase();
  return /^[\p{L}\p{N}_-]{2,100}$/u.test(s) ? s : null;
}

export function linkedInUrl(slug: string) {
  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}/`;
}

// LinkedIn appends an ID to duplicate names: dan-abramov-6b4a43, rahul-sharma-12345678.
const ID_SEGMENT = /^(?=.*\d)[0-9a-f]{3,}$/i;
const TITLE_SUFFIX = new Set(["phd", "mba", "cpa", "cfa", "pmp", "md"]);

function slugParts(slug: string): string[] {
  const parts = slug.split(/[-_]+/).filter(Boolean);
  while (parts.length > 1 && (ID_SEGMENT.test(parts.at(-1)!) || TITLE_SUFFIX.has(parts.at(-1)!))) parts.pop();
  return parts;
}

/** "dan-abramov-6b4a43" → "Dan Abramov". Null when the slug has no name to read (e.g. "danabra"). */
export function nameFromSlug(slug: string): string | null {
  const parts = slugParts(slug);
  if (parts.length < 2 || parts.some((p) => /\d/.test(p))) return null;
  return parts.map((p) => p.charAt(0).toLocaleUpperCase() + p.slice(1)).join(" ");
}

const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

/** GitHub usernames worth trying: slug without its ID, then joined / hyphenated / initial + last name. */
export function usernameGuesses(slug: string, name: string | null, max = 5): string[] {
  const ascii = (w: string) => w.replace(/[^a-z0-9]/g, "");
  const w = name ? words(name).map(ascii).filter(Boolean) : [];
  const guesses = [
    slugParts(slug).join("-"),
    w.join(""),
    w.join("-"),
    w.length >= 2 ? w[0][0] + w.at(-1) : "",
  ];
  return [...new Set(guesses.filter((g) => GITHUB_LOGIN.test(g)))].slice(0, max);
}

/** Every linkedin.com/in/<slug> in a piece of text, normalised. The slug ends at a boundary. */
export function linkedInSlugsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = [...text.matchAll(/linkedin\.com\/in\/([\p{L}\p{N}%_-]+)/giu)]
    .map((m) => normaliseSlug(m[1]))
    .filter((s): s is string => !!s);
  return [...new Set(found)];
}

/** Accent-free, lowercased words. */
export function words(s: string): string[] {
  return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export type NameMatch = "full" | "partial" | "none";

/** True when every word of the shorter list is in the longer one. */
function contained(a: string[], b: string[]) {
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const set = new Set(long);
  return short.every((w) => set.has(w));
}

/**
 * Same words, or one name inside the other with at least 2 words ("John Smith" in "John Michael
 * Smith") → full. A single word inside the other ("dan" vs "Dan Abramov") → partial.
 */
export function compareNames(wanted: string, github: string | null): NameMatch {
  if (!github) return "none";
  const a = [...new Set(words(wanted))];
  const b = [...new Set(words(github))];
  if (!contained(a, b)) return "none";
  return Math.min(a.length, b.length) >= 2 || a.length === b.length ? "full" : "partial";
}

const COMPANY_FILLER = new Set(["inc", "llc", "ltd", "pvt", "private", "limited", "corp", "co", "the"]);
const companyWords = (s: string) => words(s.replace(/^@/, "")).filter((w) => !COMPANY_FILLER.has(w));
// The most specific place: "New Delhi, India" → "New Delhi".
const placeWords = (s: string) => words(s.split(",")[0]);

/** Whole-word matching, so "Meta" ≠ "MetaMask", "IIT" ≠ "IIITD", and "India" ≠ "New Delhi, India". */
export const companyMatches = (field: string, hint: string) => contained(companyWords(field), companyWords(hint));
export const cityMatches = (field: string, hint: string) => contained(placeWords(field), placeWords(hint));
export function collegeMatches(bio: string, hint: string) {
  const bioWords = new Set(words(bio));
  const hintWords = words(hint);
  return hintWords.length > 0 && hintWords.every((w) => bioWords.has(w));
}

export type Hints = { name: string | null; company: string; city: string; school: string };

export type AccountFacts = {
  login: string;
  name: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
  blog: string | null;
  social: string[]; // social account URLs
  repoHits: { repo: string; path: string }[]; // repos this account owns that contain the exact link
};

export type Tier = "confirmed" | "likely" | "possible" | "ruled-out";
export type Evidence = { text: string; tone: "for" | "against" | "info" };
export type Assessment = { tier: Tier | null; evidence: Evidence[]; warning: string | null };

/** Above this many GitHub accounts with the same name, one matching detail isn't enough for Likely. */
export const COMMON_NAME_THRESHOLD = 100;
export const detailsNeededFor = (nameTotal: number | null) =>
  nameTotal !== null && nameTotal > COMMON_NAME_THRESHOLD ? 2 : 1;

export function assess(
  slug: string,
  hints: Hints,
  a: AccountFacts,
  { detailsNeeded = 1 }: { detailsNeeded?: number } = {},
): Assessment {
  const evidence: Evidence[] = [];
  const login = a.login.toLowerCase();

  // Links from the account's own profile.
  const ownFields: [string, string[]][] = [
    ["GitHub social accounts", a.social.flatMap(linkedInSlugsIn)],
    ["bio", linkedInSlugsIn(a.bio)],
    ["website field", linkedInSlugsIn(a.blog)],
  ];
  let ownLink = false;
  const otherSlugs = new Set<string>();
  for (const [where, slugs] of ownFields) {
    if (slugs.includes(slug)) {
      ownLink = true;
      evidence.push({ text: `Links to this LinkedIn profile (${where})`, tone: "for" });
    }
    slugs.filter((s) => s !== slug).forEach((s) => otherSlugs.add(s));
  }

  let repoLink = false;
  for (const hit of a.repoHits) {
    const repo = hit.repo.toLowerCase();
    if (repo === login) {
      ownLink = true;
      evidence.push({ text: `Links to this LinkedIn profile (profile README, ${a.login}/${a.login})`, tone: "for" });
    } else if (repo === `${login}.github.io`) {
      ownLink = true;
      evidence.push({ text: `Links to this LinkedIn profile (personal site repo, ${hit.repo})`, tone: "for" });
    } else {
      repoLink = true;
      evidence.push({ text: `Links to this LinkedIn profile in their repo ${hit.repo} (${hit.path})`, tone: "for" });
    }
  }

  if (!ownLink) {
    for (const s of otherSlugs) {
      evidence.push({ text: `Links to a different LinkedIn profile: linkedin.com/in/${s}`, tone: "against" });
    }
  }

  let nameMatch: NameMatch = "none";
  if (hints.name) {
    nameMatch = compareNames(hints.name, a.name);
    evidence.push(
      nameMatch === "full"
        ? { text: `Name matches: ${a.name}`, tone: "for" }
        : nameMatch === "partial"
          ? { text: `Name partly matches: GitHub says "${a.name}"`, tone: "for" }
          : a.name
            ? { text: `Name doesn't match: GitHub says "${a.name}"`, tone: "against" }
            : { text: "No name on their GitHub profile", tone: "info" },
    );
  }

  let detailMatches = 0;
  const detail = (
    label: string,
    hint: string,
    field: string | null,
    matches: (field: string, hint: string) => boolean,
    missing: string,
  ) => {
    if (!hint) return;
    if (field && matches(field, hint)) {
      detailMatches++;
      evidence.push({ text: `${label} matches: ${field}`, tone: "for" });
    } else {
      evidence.push(
        field
          ? { text: `${label} doesn't match: GitHub says "${field}"`, tone: "against" }
          : { text: missing, tone: "info" },
      );
    }
  };
  detail("Company", hints.company, a.company, companyMatches, "No company on their GitHub profile");
  detail("City", hints.city, a.location, cityMatches, "No location on their GitHub profile");
  if (hints.school) {
    if (a.bio && collegeMatches(a.bio, hints.school)) {
      detailMatches++;
      evidence.push({ text: `College matches: "${hints.school}" is in their bio`, tone: "for" });
    } else {
      evidence.push({ text: "College isn't mentioned in their bio", tone: "info" });
    }
  }

  let tier: Tier | null = ownLink
    ? "confirmed"
    : repoLink || (nameMatch === "full" && detailMatches >= detailsNeeded)
      ? "likely"
      : nameMatch !== "none"
        ? "possible"
        : null;

  // They link their own, different LinkedIn profile: almost certainly someone else.
  if (tier && tier !== "confirmed" && otherSlugs.size > 0) tier = "ruled-out";

  const warning =
    tier !== "possible"
      ? null
      : nameMatch === "partial"
        ? "Only part of the name matches. Check their profile before choosing."
        : detailMatches > 0
          ? "Common name, and only one other detail matches. Check their profile before choosing."
          : "Only the name matches. Check their profile before choosing.";
  return { tier, evidence, warning };
}

/**
 * Which account gets the filled "This is them" button: the only account in the best group that has
 * any (Confirmed, else Likely). A tie there, or only weaker tiers, means nobody gets it.
 */
export function primaryIndex(tiers: Tier[]): number | null {
  for (const best of ["confirmed", "likely"] as const) {
    const at = tiers.flatMap((t, i) => (t === best ? [i] : []));
    if (at.length) return at.length === 1 ? at[0] : null;
  }
  return null;
}
