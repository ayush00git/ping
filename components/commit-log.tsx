import Link from "next/link";
import { getCommits, patchUrl, PER_PAGE, type Commit } from "@/lib/github";
import { classify } from "@/lib/emails";
import { formatDate } from "@/components/format";
import LookupError from "@/components/lookup-error";
import { Bone, Email, Sep, StatusLabel } from "@/components/ui";

export default async function CommitLog({
  fullName,
  username,
  page,
}: {
  fullName: string;
  username: string;
  page: number;
}) {
  const href = (p: number) => `/?u=${encodeURIComponent(username)}${p > 1 ? `&page=${p}` : ""}#commits`;

  let commits: Commit[];
  try {
    commits = await getCommits(fullName, page);
  } catch (e) {
    return <LookupError error={e} username={username} retryHref={href(page)} />;
  }

  if (commits.length === 0) {
    return (
      <p className="text-sm text-muted">
        {page === 1 ? (
          "This repository has no commits yet."
        ) : (
          <>
            No commits on page {page}.{" "}
            <Link href={href(1)} className="text-accent underline underline-offset-2">
              Go to page 1
            </Link>
          </>
        )}
      </p>
    );
  }

  const hasOlder = commits.length === PER_PAGE;
  return (
    <>
      <ol className="divide-y divide-line border-y border-line">
        {commits.map((c) => (
          <CommitRow key={c.sha} c={c} fullName={fullName} />
        ))}
      </ol>

      {(page > 1 || hasOlder) && (
        <nav aria-label="Commit pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? <PageLink href={href(page - 1)}>← Newer commits</PageLink> : <span />}
          <span className="text-muted">Page {page}</span>
          {hasOlder ? <PageLink href={href(page + 1)}>Older commits →</PageLink> : <span />}
        </nav>
      )}
    </>
  );
}

function CommitRow({ c, fullName }: { c: Commit; fullName: string }) {
  const [title, ...rest] = c.commit.message.split("\n");
  const body = rest.join("\n").trim();
  const author = c.author ? `@${c.author.login}` : (c.commit.author?.name ?? "Unknown author");
  const date = c.commit.author?.date;
  const email = c.commit.author?.email?.toLowerCase();

  return (
    <li className="py-4">
      <a
        href={c.html_url}
        target="_blank"
        rel="noopener"
        className="font-medium [overflow-wrap:anywhere] underline-offset-2 hover:underline"
      >
        {title}
      </a>
      {body && (
        <p className="mt-1 line-clamp-2 text-[13.5px] whitespace-pre-line text-muted [overflow-wrap:anywhere]">
          {body}
        </p>
      )}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <span>{author}</span>
        {date && (
          <>
            <Sep />
            <time dateTime={date}>{formatDate(date)}</time>
          </>
        )}
        {email && (
          <>
            <Sep />
            <Email email={email} className="text-ink" />
            <StatusLabel email={email} kind={classify(email, c.commit.author?.name, c.author?.login)} short />
          </>
        )}
        <Sep />
        <a
          href={c.html_url}
          target="_blank"
          rel="noopener"
          aria-label={`Commit ${c.sha.slice(0, 7)} on GitHub`}
          className="font-mono text-accent underline-offset-2 hover:underline"
        >
          {c.sha.slice(0, 7)}
        </a>
        <Sep />
        <a
          href={patchUrl(fullName, c.sha)}
          target="_blank"
          rel="noopener"
          aria-label={`Commit ${c.sha.slice(0, 7)} as a .patch file`}
          className="font-mono text-accent underline-offset-2 hover:underline"
        >
          .patch
        </a>
      </p>
    </li>
  );
}

function PageLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-line px-4 py-2 text-accent transition hover:border-accent"
    >
      {children}
    </Link>
  );
}

export function CommitRowsSkeleton() {
  return (
    <div className="divide-y divide-line border-y border-line motion-safe:animate-pulse" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="py-4">
          <Bone className="h-4 w-3/4" />
          <Bone className="mt-2.5 h-3 w-1/2 opacity-70" />
        </div>
      ))}
    </div>
  );
}
