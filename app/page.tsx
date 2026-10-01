import { Suspense } from "react";
import { redirect } from "next/navigation";
import SearchForm from "@/components/search-form";
import Results, { ResultsSkeleton } from "@/components/results";
import RecipientsTray from "@/components/recipients-tray";
import { Footer, SHELL, TopBar } from "@/components/page-chrome";
import ListLink from "@/components/list-link";
import { parseLinkedInUrl } from "@/lib/linkedin";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const username = first(params.u)?.trim().replace(/^@/, "") ?? "";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  // A LinkedIn URL goes to the finder instead of the lookup.
  const linkedIn = username ? parseLinkedInUrl(username) : null;
  if (linkedIn?.kind === "profile") redirect(`/find?li=${encodeURIComponent(linkedIn.slug)}`);
  if (linkedIn) redirect(`/find?url=${encodeURIComponent(username)}`);

  // Empty homepage: title and search centred on the screen, footer at the bottom.
  if (!username) {
    return (
      <main className={`${SHELL} flex min-h-dvh flex-col`}>
        <div className="flex h-12 items-center justify-end">
          <ListLink onlyWhenNonEmpty />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <h1 className="font-serif text-4xl tracking-tight">ping</h1>
          <p className="mt-2 text-muted">Find a developer&apos;s public commit email.</p>
          <SearchForm defaultValue="" className="mt-8 w-full max-w-xl text-left" />
        </div>
        <Footer />
        <RecipientsTray />
      </main>
    );
  }

  // Results: a compact bar at the top, results below.
  return (
    <main className={`${SHELL} pt-6 sm:pt-8`}>
      <TopBar defaultValue={username} />

      {/* Keyed by user only: paging the commit log reloads just that section. */}
      <Suspense key={username} fallback={<ResultsSkeleton username={username} />}>
        <Results username={username} page={page} />
      </Suspense>

      <Footer className="mt-20" />
      <RecipientsTray />
    </main>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
