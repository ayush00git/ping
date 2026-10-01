import "server-only";
import {
  GitHubError,
  NetworkError,
  getSocialUrls,
  getUser,
  searchCodeForLinkedIn,
  searchUsersByName,
  type GitHubUser,
} from "@/lib/github";
import {
  assess,
  detailsNeededFor,
  linkedInSlugsIn,
  usernameGuesses,
  type Assessment,
  type Hints,
  type Tier,
} from "@/lib/linkedin";

export const MAX_ACCOUNTS = 10;

export type Source = "link" | "name" | "guess";
export type Found = Assessment & { tier: Tier; user: GitHubUser; source: Source };

export type FindResult = {
  found: Found[]; // accounts with evidence, best first
  checked: Record<Source, number>; // every account checked, shown or not
  nameTotal: number | null; // GitHub's total for the plain name search
  detailsNeeded: number; // matching details Likely needs: 2 for a common name
  skipped: string[]; // searches that couldn't run, in plain words
  requests: number; // GitHub API calls this lookup made
};

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };
const settle = <T,>(p: Promise<T>): Promise<Settled<T>> =>
  p.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );

const isNotFound = (e: unknown) => e instanceof GitHubError && e.status === 404;

function whySkipped(what: string, e: unknown, limitNote: string): string {
  if (e instanceof GitHubError && e.rateLimited) return `${what} was skipped: ${limitNote} Try again in a minute.`;
  return `${what} failed: ${e instanceof Error ? e.message : "unknown error"}.`;
}

/** Runs `fn` over `items` with at most `limit` in flight, to stay clear of GitHub's secondary limits. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function findAccounts(slug: string, hints: Hints): Promise<FindResult> {
  let requests = 0;
  const call = <T,>(p: () => Promise<T>) => {
    requests++;
    return settle(p());
  };
  const skipped: string[] = [];
  const failures: unknown[] = [];

  const [code, byNameCity, byName, guessed] = await Promise.all([
    call(() => searchCodeForLinkedIn(slug)),
    hints.name && hints.city ? call(() => searchUsersByName(hints.name!, hints.city)) : null,
    hints.name ? call(() => searchUsersByName(hints.name!)) : null,
    Promise.all(usernameGuesses(slug, hints.name).map((g) => call(() => getUser(g)))),
  ]);

  // a. Repos that contain this exact profile URL. Only evidence about the repo's owner.
  const linkHits = new Map<string, { repo: string; path: string }[]>();
  if (code.ok) {
    for (const hit of code.value) {
      if (hit.ownerType !== "User") continue;
      if (!hit.fragments.some((f) => linkedInSlugsIn(f).includes(slug))) continue;
      const key = hit.owner.toLowerCase();
      linkHits.set(key, [...(linkHits.get(key) ?? []), { repo: hit.repo, path: hit.path }]);
    }
  } else {
    failures.push(code.error);
    skipped.push(
      whySkipped("The search for accounts that link to this LinkedIn URL", code.error, "GitHub's code search allows 10 searches a minute."),
    );
  }

  // b. Name search.
  for (const r of [byNameCity, byName]) {
    if (r && !r.ok) failures.push(r.error);
  }
  const nameFailed = [byNameCity, byName].find((r) => r && !r.ok);
  if (nameFailed && !nameFailed.ok) {
    skipped.push(whySkipped("The name search", nameFailed.error, "GitHub allows 30 searches a minute."));
  }

  // c. Username guesses. A 404 just means nobody has that name.
  const guessUsers = new Map<string, GitHubUser>();
  const guessError = guessed.find((g) => !g.ok && !isNotFound(g.error));
  for (const g of guessed) {
    if (g.ok && g.value.type === "User") guessUsers.set(g.value.login.toLowerCase(), g.value);
  }
  if (guessError && !guessError.ok) {
    failures.push(guessError.error);
    skipped.push(whySkipped("Username guesses", guessError.error, "GitHub's rate limit is reached."));
  }

  // Candidates in order of strength, deduplicated, at most MAX_ACCOUNTS.
  const candidates = new Map<string, { login: string; source: Source }>();
  const offer = (login: string, source: Source) => {
    const key = login.toLowerCase();
    if (!candidates.has(key) && candidates.size < MAX_ACCOUNTS) candidates.set(key, { login, source });
  };
  for (const owner of linkHits.keys()) offer(owner, "link");
  if (byNameCity?.ok) byNameCity.value.logins.forEach((l) => offer(l, "name"));
  for (const u of guessUsers.values()) offer(u.login, "guess");
  if (byName?.ok) byName.value.logins.forEach((l) => offer(l, "name"));

  // Nothing ran at all: surface the error itself (rate limit, network) instead of an empty result.
  if (candidates.size === 0 && failures.length > 0) {
    const network = failures.find((e) => e instanceof NetworkError);
    throw network ?? failures[0];
  }

  const nameTotal = byName?.ok ? byName.value.total : null;
  const detailsNeeded = detailsNeededFor(nameTotal);

  // d. Check each candidate's profile and social accounts.
  let checkFailed: unknown = null;
  const checked: Record<Source, number> = { link: 0, name: 0, guess: 0 };
  const results = await mapLimit([...candidates.values()], 5, async ({ login, source }) => {
    const known = guessUsers.get(login.toLowerCase());
    const [user, social] = await Promise.all([
      known ? { ok: true as const, value: known } : call(() => getUser(login)),
      call(() => getSocialUrls(login)),
    ]);
    if (!user.ok) {
      if (!isNotFound(user.error)) checkFailed ??= user.error;
      return null;
    }
    if (user.value.type !== "User") return null;
    if (!social.ok && !isNotFound(social.error)) checkFailed ??= social.error;
    checked[source]++;

    const u = user.value;
    const a = assess(slug, hints, {
      login: u.login,
      name: u.name,
      company: u.company,
      location: u.location,
      bio: u.bio,
      blog: u.blog,
      social: social.ok ? social.value : [],
      repoHits: linkHits.get(u.login.toLowerCase()) ?? [],
    }, { detailsNeeded });
    return a.tier ? ({ ...a, tier: a.tier, user: u, source } satisfies Found) : null;
  });

  if (checkFailed) {
    if (checkFailed instanceof NetworkError) throw checkFailed;
    skipped.push(whySkipped("Checking some accounts", checkFailed, "GitHub's rate limit is reached."));
  }

  const rank: Record<Tier, number> = { confirmed: 0, likely: 1, possible: 2, "ruled-out": 3 };
  const found = results
    .filter((r): r is Found => r !== null)
    .sort(
      (a, b) =>
        rank[a.tier] - rank[b.tier] ||
        b.evidence.filter((e) => e.tone === "for").length - a.evidence.filter((e) => e.tone === "for").length ||
        b.user.followers - a.user.followers,
    );

  return {
    found,
    checked,
    nameTotal,
    detailsNeeded,
    skipped,
    requests,
  };
}
