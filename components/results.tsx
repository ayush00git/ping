import { Suspense } from "react";
import Image from "next/image";
import { getAuthorCommits, getLatestRepo, PER_PAGE, type Commit, type Repo } from "@/lib/github";
import { collectCandidates } from "@/lib/emails";
import { formatDate } from "@/components/format";
import CommitLog, { CommitRowsSkeleton } from "@/components/commit-log";
import EmailsPanel from "@/components/emails-panel";
import LookupError from "@/components/lookup-error";
import { Bone, Card, Notice, SectionHeading } from "@/components/ui";
import { STICKY_SIDE } from "@/components/page-chrome";

const SELECTION_RULE = "Most recently created repository (forks skipped)";

export default async function Results({
  username,
  page,
  linkedRepo,
}: {
  username: string;
  page: number;
  /** The repo named in a pasted GitHub link, if any. */
  linkedRepo?: string;
}) {
  let repo: Repo | null = null;
  let authorCommits: Commit[] = [];
  let failure: unknown = null;
  try {
    repo = await getLatestRepo(username);
    if (repo) authorCommits = await getAuthorCommits(repo.full_name, username);
  } catch (e) {
    failure = e;
  }

  const retryHref = `/?u=${encodeURIComponent(username)}${page > 1 ? `&page=${page}` : ""}`;
  if (failure) return <LookupError error={failure} username={username} retryHref={retryHref} />;
  if (!repo) {
    return (
      <Notice title={`@${username} has no public repositories of their own`}>
        Forks are skipped, so a user who only has forks shows up here too.
      </Notice>
    );
  }

  const login = repo.owner.login;
  const candidates = collectCandidates({ commits: authorCommits, username: login, fullName: repo.full_name });

  return (
    // Wide screens: the answer (repo + emails) stays in view on the left while commits scroll on the right.
    <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:items-start lg:gap-10">
      <div className={`space-y-12 lg:col-span-5 ${STICKY_SIDE}`}>
        <RepoSummary repo={repo} linkedRepo={linkedRepo} />

        <EmailsPanel
          candidates={candidates}
          login={login}
          repoName={repo.name}
          repoUrl={repo.html_url}
          scanned={authorCommits.length}
        />
      </div>

      <section id="commits" aria-labelledby="commits-h" className="scroll-mt-6 lg:col-span-7">
        <SectionHeading
          id="commits-h"
          title="Commits"
          scope={`All authors, newest first, on the ${repo.default_branch} branch · page ${page} · ${PER_PAGE} per page`}
        />
        <Suspense key={page} fallback={<CommitRowsSkeleton />}>
          <CommitLog fullName={repo.full_name} username={username} page={page} />
        </Suspense>
      </section>
    </div>
  );
}

function RepoSummary({ repo, linkedRepo }: { repo: Repo; linkedRepo?: string }) {
  // A pasted link named a different repo: say which one ping shows instead.
  const otherRepo = linkedRepo && linkedRepo.toLowerCase() !== repo.name.toLowerCase() ? linkedRepo : null;
  return (
    <section aria-labelledby="repo-h">
      <SectionHeading
        id="repo-h"
        title="Repository"
        scope={
          otherRepo && (
            <>
              Your link pointed to{" "}
              <a
                href={`https://github.com/${repo.owner.login}/${encodeURIComponent(otherRepo)}`}
                target="_blank"
                rel="noopener"
                className="font-mono text-accent underline-offset-2 hover:underline"
              >
                {repo.owner.login}/{otherRepo}
              </a>
              . ping shows their most recently created repository instead.
            </>
          )
        }
      />
      <Card>
        <div className="flex items-center gap-3">
          <Image
            src={repo.owner.avatar_url}
            alt=""
            width={40}
            height={40}
            className="shrink-0 rounded-full border border-line"
          />
          <div className="min-w-0">
            <p className="text-sm text-muted">@{repo.owner.login}</p>
            <a
              href={repo.html_url}
              target="_blank"
              rel="noopener"
              className="font-serif text-2xl leading-tight break-words underline-offset-4 hover:underline"
            >
              {repo.name}
            </a>
          </div>
        </div>

        <p className={`mt-3 max-w-prose ${repo.description ? "" : "text-muted"}`}>{repo.description ?? "No description."}</p>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
          <Fact label="Language">{repo.language ?? "Not detected"}</Fact>
          <Fact label="Stars">{repo.stargazers_count.toLocaleString("en-US")}</Fact>
          <Fact label="Default branch">
            <span className="font-mono">{repo.default_branch}</span>
          </Fact>
          <Fact label="Created">{formatDate(repo.created_at)}</Fact>
          <Fact label="Why this repo" className="col-span-2 sm:col-span-4 lg:col-span-2 2xl:col-span-4">
            {SELECTION_RULE}
          </Fact>
        </dl>
      </Card>
    </section>
  );
}

function Fact({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

export function ResultsSkeleton({ username }: { username: string }) {
  return (
    <div className="mt-12" aria-busy="true">
      <p role="status" className="text-sm text-muted">
        Looking up @{username} on GitHub…
      </p>
      <div className="mt-6 grid gap-12 motion-safe:animate-pulse lg:grid-cols-12 lg:items-start lg:gap-10" aria-hidden>
        <div className="space-y-12 lg:col-span-5">
          <div>
            <Bone className="mb-4 h-5 w-28" />
            <Card>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-line" />
                <div className="flex-1">
                  <Bone className="h-3 w-20" />
                  <Bone className="mt-2 h-5 w-40" />
                </div>
              </div>
              <Bone className="mt-4 h-3.5 w-2/3" />
              <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i}>
                    <Bone className="h-2.5 w-12" />
                    <Bone className="mt-2 h-3.5 w-16" />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div>
            <Bone className="h-5 w-32" />
            <Bone className="mt-2 mb-4 h-3.5 w-3/4" />
            <Card>
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="py-2.5">
                  <Bone className="h-4 w-1/2" />
                  <Bone className="mt-2 h-3 w-3/4 opacity-70" />
                </div>
              ))}
            </Card>
          </div>
        </div>

        <div className="lg:col-span-7">
          <Bone className="h-5 w-24" />
          <Bone className="mt-2 mb-4 h-3.5 w-2/3" />
          <CommitRowsSkeleton />
        </div>
      </div>
    </div>
  );
}
