import Link from "next/link";
import SearchForm from "@/components/search-form";
import ListLink from "@/components/list-link";

/** The compact bar above results: "ping" (home link) and the search box. */
export function TopBar({ defaultValue, autoFocus }: { defaultValue: string; autoFocus?: boolean }) {
  return (
    // Phone: "ping … Your list" on one row, search below. Wider: all three on one row.
    <header className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 sm:grid-cols-[auto_1fr_auto]">
      <h1 className="font-serif text-3xl leading-none tracking-tight">
        <Link href="/" className="underline-offset-4 hover:underline">
          ping
        </Link>
      </h1>
      <div className="justify-self-end sm:order-last">
        <ListLink />
      </div>
      <SearchForm defaultValue={defaultValue} autoFocus={autoFocus} className="col-span-2 sm:col-span-1" />
    </header>
  );
}

export function Footer({ className = "" }: { className?: string }) {
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
