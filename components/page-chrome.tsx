import Link from "next/link";
import SearchForm from "@/components/search-form";
import ListLink from "@/components/list-link";

/** Page width for every page: full width with side padding, capped for ultrawide screens. */
export const SHELL = "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10";

/**
 * The left column on wide screens stays in view while the right one scrolls. It never grows taller
 * than the screen (minus the recipient tray, which sets --tray-space), scrolling inside instead.
 */
export const STICKY_SIDE =
  "lg:sticky lg:top-6 lg:max-h-[calc(100dvh_-_3rem_-_var(--tray-space,0px))] lg:overflow-y-auto lg:pb-1";

/** The compact bar above results: "ping" (home link) and the search box. */
export function TopBar({ defaultValue, autoFocus }: { defaultValue: string; autoFocus?: boolean }) {
  return (
    // Phone: "ping … Your list" on one row, search below. Wider: all three on one row, search centred.
    <header className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <h1 className="font-serif text-3xl leading-none tracking-tight">
        <Link href="/" className="underline-offset-4 hover:underline">
          ping
        </Link>
      </h1>
      <div className="justify-self-end sm:order-last">
        <ListLink />
      </div>
      <SearchForm defaultValue={defaultValue} autoFocus={autoFocus} className="col-span-2 sm:col-span-1 sm:w-full sm:max-w-2xl sm:justify-self-center" />
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
