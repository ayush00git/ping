import Link from "next/link";
import SearchForm from "@/components/search-form";

/** The compact bar above results: "ping" (home link) and the search box. */
export function TopBar({ defaultValue }: { defaultValue: string }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <h1 className="font-serif text-3xl leading-none tracking-tight">
        <Link href="/" className="underline-offset-4 hover:underline">
          ping
        </Link>
      </h1>
      <SearchForm defaultValue={defaultValue} className="sm:flex-1" />
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
