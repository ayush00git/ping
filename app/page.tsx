import { Suspense } from "react";
import Link from "next/link";
import SearchForm from "@/components/search-form";
import Results, { ResultsSkeleton } from "@/components/results";
import RecipientsTray from "@/components/recipients-tray";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const username = first(params.u)?.trim().replace(/^@/, "") ?? "";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  // Empty homepage: title and search centred on the screen, footer at the bottom.
  if (!username) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 sm:px-6">
        <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <h1 className="font-serif text-4xl tracking-tight">ping</h1>
          <p className="mt-2 text-muted">Find a GitHub user&apos;s public commit email.</p>
          <SearchForm defaultValue="" className="mt-8 w-full max-w-xl text-left" />
        </div>
        <Footer />
        <RecipientsTray />
      </main>
    );
  }

  // Results: a compact bar at the top, results below.
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <h1 className="font-serif text-3xl leading-none tracking-tight">
          <Link href="/" className="underline-offset-4 hover:underline">
            ping
          </Link>
        </h1>
        <SearchForm defaultValue={username} className="sm:flex-1" />
      </header>

      {/* Keyed by user only: paging the commit log reloads just that section. */}
      <Suspense key={username} fallback={<ResultsSkeleton username={username} />}>
        <Results username={username} page={page} />
      </Suspense>

      <Footer className="mt-20" />
      <RecipientsTray />
    </main>
  );
}

function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-line py-5 text-[13px] text-muted ${className}`}>
      Data comes from the public{" "}
      <a
        className="text-accent underline underline-offset-2"
        href="https://docs.github.com/rest"
        target="_blank"
        rel="noopener"
      >
        GitHub API
      </a>
      . Results are cached for 60 seconds.
    </footer>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
