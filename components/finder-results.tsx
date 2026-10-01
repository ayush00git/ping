import Image from "next/image";
import Link from "next/link";
import { primaryIndex, type Hints, type Tier } from "@/lib/linkedin";
import { findAccounts, type FindResult, type Found, type Source } from "@/lib/resolve";
import LookupError from "@/components/lookup-error";
import { Bone, Card, plural } from "@/components/ui";

const GROUPS: { tier: Exclude<Tier, "ruled-out">; title: string; about: string }[] = [
  { tier: "confirmed", title: "Confirmed", about: "Their own GitHub profile links to this LinkedIn profile." },
  { tier: "likely", title: "Likely", about: "A repo of theirs links to it, or the full name and another detail match." },
  { tier: "possible", title: "Possible", about: "The name matches, but nothing else confirms it." },
];

const FOUND_BY: Record<Source, string> = {
  link: "a search for this LinkedIn URL",
  name: "the name search",
  guess: "a username guess",
};

export default async function FinderResults({
  slug,
  hints,
  retryHref,
}: {
  slug: string;
  hints: Hints;
  retryHref: string;
}) {
  let result: FindResult | null = null;
  let error: unknown = null;
  try {
    result = await findAccounts(slug, hints);
  } catch (e) {
    error = e;
  }
  if (!result) {
    return (
      <LookupError
        error={error}
        username={slug}
        subject="this LinkedIn profile"
        retryHref={retryHref}
        rateLimitNote="The search for pages that link to this profile uses GitHub's code search, which allows 10 searches a minute."
      />
    );
  }

  const { found, skipped, requests } = result;
  const shown = found.filter((f) => f.tier !== "ruled-out");
  const ruledOut = found.filter((f) => f.tier === "ruled-out");
  // The filled button means "probably the one", so at most one account gets it.
  const primaryAt = primaryIndex(found.map((f) => f.tier));
  const primary = primaryAt === null ? null : found[primaryAt].user.login;
  return (
    <>
      <p className="-mt-2 mb-5 text-sm text-muted">
        {scopeLine(result, hints)}
        {result.detailsNeeded > 1 && result.nameTotal !== null && (
          <>
            <br />
            {hints.name} is a common name ({result.nameTotal.toLocaleString("en-US")} GitHub accounts), so Likely
            needs two matching details.
          </>
        )}
      </p>

      {skipped.length > 0 && (
        <div role="status" className="mb-5 rounded-xl border border-line px-4 py-3 text-sm">
          {skipped.map((s) => (
            <p key={s}>{s}</p>
          ))}
        </div>
      )}

      {shown.length === 0 && ruledOut.length === 0 ? (
        <Card>
          <p className="font-medium">No GitHub account found.</p>
          <p className="mt-1 text-sm text-muted">They may not have one, or use a different name there.</p>
        </Card>
      ) : (
        <div className="space-y-10">
          {shown.length === 0 && (
            <Card>
              <p className="font-medium">No GitHub account found.</p>
              <p className="mt-1 text-sm text-muted">
                The only matches link to a different LinkedIn profile. They&apos;re listed under Ruled out.
              </p>
            </Card>
          )}
          {GROUPS.map(({ tier, title, about }) => {
            const inTier = shown.filter((f) => f.tier === tier);
            if (inTier.length === 0) return null;
            return (
              <div key={tier}>
                <h3 className="font-medium">
                  {title} <span className="text-muted">· {inTier.length}</span>
                </h3>
                <p className="mb-3 text-sm text-muted">{about}</p>
                {tier !== "possible" && inTier.length > 1 && (
                  <p className="-mt-2 mb-3 text-sm font-medium">
                    {inTier.length} accounts match equally. Compare them before choosing.
                  </p>
                )}
                <ul className="space-y-3">
                  {inTier.map((f) => (
                    <AccountCard key={f.user.login} f={f} primary={f.user.login === primary} />
                  ))}
                </ul>
              </div>
            );
          })}
          {ruledOut.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer font-medium">
                Ruled out <span className="text-muted">· {ruledOut.length}</span>
                <span className="ml-2 text-sm font-normal text-accent group-open:hidden">Show</span>
                <span className="ml-2 hidden text-sm font-normal text-accent group-open:inline">Hide</span>
              </summary>
              <p className="mb-3 text-sm text-muted">Their GitHub profile links to a different LinkedIn profile.</p>
              <ul className="space-y-3">
                {ruledOut.map((f) => (
                  <AccountCard key={f.user.login} f={f} primary={false} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <p className="mt-6 text-[13px] text-muted">This search made {plural(requests, "GitHub API request")}.</p>
    </>
  );
}

function scopeLine({ found, checked, nameTotal }: FindResult, hints: Hints) {
  const total = checked.link + checked.name + checked.guess;
  const parts: string[] = [];
  if (checked.link) parts.push(`${checked.link} from a search for this LinkedIn URL`);
  if (checked.name) {
    const of = nameTotal && nameTotal > checked.name ? ` (out of ${nameTotal.toLocaleString("en-US")} GitHub accounts with this name)` : "";
    parts.push(`${checked.name} from a name search${of}`);
  }
  if (checked.guess) parts.push(`${checked.guess} from username ${checked.guess === 1 ? "guess" : "guesses"}`);

  const noName = hints.name ? "" : " There was no name search because no name is given.";
  if (total === 0) return `No accounts to check.${noName}`;
  const ruledOut = found.filter((f) => f.tier === "ruled-out").length;
  const showing = `Showing ${found.length - ruledOut}${ruledOut ? `, and ${ruledOut} ruled out` : ""}`;
  return `Checked ${plural(total, "account")}: ${parts.join(", ")}. ${showing}.${noName}`;
}

function AccountCard({ f, primary }: { f: Found; primary: boolean }) {
  const u = f.user;
  const meta = [`@${u.login}`, u.company, u.location].filter(Boolean).join(" · ");
  return (
    <li>
      <Card>
        <div className="flex items-start gap-3">
          <Image src={u.avatar_url} alt="" width={40} height={40} className="shrink-0 rounded-full border border-line" />
          <div className="min-w-0">
            <p className="font-medium break-words">{u.name ?? u.login}</p>
            <p className="text-sm break-words text-muted">{meta}</p>
          </div>
        </div>
        {u.bio && <p className="mt-3 line-clamp-2 text-sm [overflow-wrap:anywhere]">{u.bio}</p>}

        <ul className="mt-3 space-y-1 text-sm">
          {f.evidence.map((e) => (
            <li key={e.text} className="flex gap-2">
              <span aria-hidden className="w-3 shrink-0 text-muted">
                {e.tone === "for" ? "✓" : e.tone === "against" ? "✗" : "–"}
              </span>
              <span className={`[overflow-wrap:anywhere] ${e.tone === "info" ? "text-muted" : ""}`}>{e.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-muted">Found by {FOUND_BY[f.source]}.</p>

        {f.warning && <p className="mt-3 text-sm text-danger">{f.warning}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/?u=${encodeURIComponent(u.login)}`}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              primary
                ? "bg-accent text-white hover:opacity-90 dark:text-bg"
                : "border border-line text-ink hover:border-accent"
            }`}
          >
            This is them
          </Link>
          <a
            href={u.html_url}
            target="_blank"
            rel="noopener"
            className="text-sm text-accent underline underline-offset-2"
          >
            View their GitHub profile
          </a>
        </div>
      </Card>
    </li>
  );
}

export function FinderSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="-mt-2 mb-5 text-sm text-muted">
        Searching GitHub…
      </p>
      <div className="space-y-3 motion-safe:animate-pulse" aria-hidden>
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-line" />
              <div className="flex-1">
                <Bone className="h-4 w-32" />
                <Bone className="mt-2 h-3 w-48" />
              </div>
            </div>
            <Bone className="mt-4 h-3 w-2/3" />
            <Bone className="mt-2 h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}
