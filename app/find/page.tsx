import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import FinderForm from "@/components/finder-form";
import FinderResults, { FinderSkeleton } from "@/components/finder-results";
import RecipientsTray from "@/components/recipients-tray";
import { Footer, SHELL, STICKY_SIDE, TopBar } from "@/components/page-chrome";
import { Card, Notice, SectionHeading } from "@/components/ui";
import { hasToken } from "@/lib/github";
import { linkedInUrl, nameFromSlug, normaliseSlug, parseLinkedInUrl, type Hints, type LinkedInUrl } from "@/lib/linkedin";

export const metadata: Metadata = {
  title: "ping · find someone's GitHub account from their LinkedIn URL",
};

export default async function FindPage({ searchParams }: PageProps<"/find">) {
  const p = await searchParams;

  // Arrived from the search box with something that isn't a person's profile URL.
  const rawUrl = first(p.url)?.trim();
  if (rawUrl !== undefined) {
    const parsed = parseLinkedInUrl(rawUrl);
    if (parsed?.kind === "profile") redirect(`/find?li=${encodeURIComponent(parsed.slug)}`);
    return (
      <Shell searchValue={rawUrl}>
        <Notice error title={problem(parsed)}>
          Paste a person&apos;s profile URL, <span className="font-mono">linkedin.com/in/…</span>
        </Notice>
      </Shell>
    );
  }

  const li = first(p.li);
  if (!li) redirect("/");
  const slug = normaliseSlug(li);
  if (!slug) {
    return (
      <Shell searchValue={li}>
        <Notice error title="That isn't a LinkedIn profile name.">
          Paste a person&apos;s profile URL, <span className="font-mono">linkedin.com/in/…</span>
        </Notice>
      </Shell>
    );
  }

  const slugName = nameFromSlug(slug);
  const nameParam = first(p.name);
  const hints: Hints = {
    // No name in the query yet: use the one read from the URL. An empty field means "no name".
    name: nameParam !== undefined ? nameParam.trim() || null : slugName,
    company: first(p.company)?.trim() ?? "",
    city: first(p.city)?.trim() ?? "",
    school: first(p.school)?.trim() ?? "",
  };
  const query = new URLSearchParams({ li: slug });
  if (nameParam !== undefined) query.set("name", nameParam);
  for (const k of ["company", "city", "school"] as const) if (hints[k]) query.set(k, hints[k]);
  const here = `/find?${query}`;

  return (
    <Shell searchValue={`linkedin.com/in/${slug}`}>
      {/* Wide screens: the profile and hints stay in view on the left, accounts on the right. */}
      <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-10">
        <section aria-labelledby="li-h" className={`lg:col-span-4 ${STICKY_SIDE}`}>
          <SectionHeading id="li-h" title="LinkedIn profile" />
          <Card>
            <p>
              <a
                href={linkedInUrl(slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm text-accent underline-offset-2 [overflow-wrap:anywhere] hover:underline"
              >
                linkedin.com/in/{slug}
              </a>
              <span className="text-[13px] text-muted"> · opens LinkedIn in a new tab</span>
            </p>
            <p className="mt-2 text-sm">
              {slugName ? (
                <>
                  Name read from the URL: <span className="font-medium">{slugName}</span>
                </>
              ) : (
                "This URL has no name in it. Type it below."
              )}
            </p>
            <FinderForm slug={slug} hints={hints} nameRequired={!slugName} />
          </Card>
        </section>

        <section aria-labelledby="gh-h" className="lg:col-span-8">
          <SectionHeading id="gh-h" title="GitHub accounts that might be them" />
          {hasToken() ? (
            <Suspense key={here} fallback={<FinderSkeleton />}>
              <FinderResults slug={slug} hints={hints} retryHref={here} />
            </Suspense>
          ) : (
            <Card>
              <p className="font-medium">The finder needs a GitHub token.</p>
              <p className="mt-1 text-sm text-muted">
                Searching GitHub for pages that link to a LinkedIn profile only works when signed in. Add{" "}
                <code className="font-mono text-ink">GITHUB_TOKEN</code> to{" "}
                <code className="font-mono text-ink">.env.local</code> and restart the server.
              </p>
            </Card>
          )}
        </section>
      </div>
    </Shell>
  );
}

function Shell({ searchValue, children }: { searchValue: string; children: React.ReactNode }) {
  return (
    <main className={`${SHELL} pt-6 sm:pt-8`}>
      <TopBar defaultValue={searchValue} />
      {children}
      <Footer className="mt-20" />
      <RecipientsTray />
    </main>
  );
}

function problem(parsed: LinkedInUrl | null) {
  if (!parsed) return "That isn't a LinkedIn URL.";
  if (parsed.kind === "not-profile" && parsed.page === "company") return "That's a company page.";
  if (parsed.kind === "not-profile" && parsed.page === "school") return "That's a school page.";
  return "That isn't a person's LinkedIn profile.";
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
