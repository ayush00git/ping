import { AUTHOR_COMMITS_LIMIT } from "@/lib/github";
import { isGitHubNoreply, type EmailCandidate } from "@/lib/emails";
import type { AddContext } from "@/lib/shortlist";
import AddToggle from "@/components/add-toggle";
import { formatDate } from "@/components/format";
import { Card, Email, SectionHeading, Sep, StatusLabel, plural } from "@/components/ui";

export default function EmailsPanel({
  candidates,
  login,
  repoName,
  repoUrl,
  scanned,
}: {
  candidates: EmailCandidate[];
  login: string;
  repoName: string;
  repoUrl: string;
  /** How many of the user's commits were read. */
  scanned: number;
}) {
  const usable = candidates.filter((c) => c.kind === "personal");
  const unusable = candidates.filter((c) => c.kind !== "personal");
  const which = scanned === AUTHOR_COMMITS_LIMIT ? `the last ${scanned}` : `all ${scanned}`;
  // Addresses the user committed with themselves (not co-authors they credited).
  const own = candidates.filter((c) => c.isUser);
  const ctx: AddContext = { username: login, repo: repoName, repoUrl };
  const onlyGitHubNoreply = own.length > 0 && own.every((c) => isGitHubNoreply(c.email));

  return (
    <section aria-labelledby="emails-h">
      <SectionHeading
        id="emails-h"
        title="Emails found"
        scope={
          scanned === 0 ? (
            <>
              GitHub has no commits by @{login} in {repoName}.
            </>
          ) : (
            <>
              {plural(candidates.length, "address", "addresses")} from {which}{" "}
              {scanned === 1 ? "commit" : "commits"} by @{login} in {repoName}
              {candidates.some((c) => c.source === "co-author") && ", including co-authors they credited"}.
            </>
          )
        }
      />

      <Card flush>
        {scanned === 0 ? (
          <p className="py-3 text-sm text-muted">
            This list only reads commits by @{login}, so it&apos;s empty. Other authors&apos; emails still
            appear in the commit log below.
          </p>
        ) : (
          <>
            <Group title="Can receive mail" count={usable.length}>
              {usable.length === 0 ? (
                <p className="pb-3 text-sm text-muted">
                  {onlyGitHubNoreply
                    ? `No public email. @${login} commits with GitHub's private noreply address.`
                    : "None of these addresses can receive mail. The reason is next to each one."}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {usable.map((c) => (
                    <EmailRow key={c.email} c={c} login={login} ctx={ctx} />
                  ))}
                </ul>
              )}
            </Group>

            {unusable.length > 0 && (
              <Group title="Can't receive mail" count={unusable.length} muted>
                <ul className="divide-y divide-line">
                  {unusable.map((c) => (
                    <EmailRow key={c.email} c={c} login={login} ctx={ctx} muted />
                  ))}
                </ul>
              </Group>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

function Group({
  title,
  count,
  muted,
  children,
}: {
  title: string;
  count: number;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-line py-2 not-first:border-t">
      <h3 className={`pt-2 pb-1 text-[13px] font-medium ${muted ? "text-muted" : ""}`}>
        {title} <span className="text-muted">· {count}</span>
      </h3>
      {children}
    </div>
  );
}

function EmailRow({
  c,
  login,
  ctx,
  muted,
}: {
  c: EmailCandidate;
  login: string;
  ctx: AddContext;
  muted?: boolean;
}) {
  const who = c.isUser ? `@${login}` : c.source === "co-author" ? "co-author" : "collaborator";
  return (
    <li className="py-3">
      {/* Line 1: address and status, with the add toggle on the right for addresses that work. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
          <Email email={c.email} className={`text-sm ${muted ? "text-muted" : ""}`} />
          <StatusLabel email={c.email} kind={c.kind} />
        </div>
        {c.kind === "personal" && <AddToggle candidate={c} ctx={ctx} />}
      </div>
      {/* Line 2: where the address came from. */}
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
        <span>{c.name}</span>
        <Sep />
        <span>{who}</span>
        <Sep />
        <span>{plural(c.commits, "commit")}</span>
        {c.lastSeen && (
          <>
            <Sep />
            <span>last commit {formatDate(c.lastSeen)}</span>
          </>
        )}
        <Sep />
        <a
          href={c.patchUrl}
          target="_blank"
          rel="noopener"
          aria-label={`Commit ${c.sha.slice(0, 7)}, the latest using ${c.email}, as a .patch file`}
          className="font-mono text-accent underline-offset-2 hover:underline"
        >
          {c.sha.slice(0, 7)}.patch
        </a>
      </p>
    </li>
  );
}
