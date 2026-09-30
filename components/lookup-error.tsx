import Link from "next/link";
import { GitHubError, NetworkError } from "@/lib/github";
import { Notice } from "@/components/ui";

export default function LookupError({
  error,
  username,
  retryHref,
}: {
  error: unknown;
  username: string;
  retryHref: string;
}) {
  const tryAgain = (label = "Try again") => (
    <Link href={retryHref} className="text-accent underline underline-offset-2">
      {label}
    </Link>
  );

  if (error instanceof GitHubError && error.status === 404) {
    return (
      <Notice error title={`No GitHub user named @${username}`}>
        Check the spelling and try again.
      </Notice>
    );
  }

  if (error instanceof GitHubError && error.rateLimited) {
    const mins = error.minutesToReset;
    return (
      <Notice error title="GitHub's rate limit is reached">
        <p>
          {error.resetAt && mins
            ? `Lookups work again at ${error.resetAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} (in about ${mins} ${mins === 1 ? "minute" : "minutes"}).`
            : "Try again in a few minutes."}
        </p>
        <p className="mt-1.5">
          {process.env.GITHUB_TOKEN ? (
            "This server already uses a GITHUB_TOKEN, which allows 5,000 requests per hour."
          ) : (
            <>
              Without a token GitHub allows 60 requests per hour, and each lookup uses about 3. Add{" "}
              <code className="font-mono text-ink">GITHUB_TOKEN</code> to{" "}
              <code className="font-mono text-ink">.env.local</code> and restart the server to raise the
              limit to 5,000.
            </>
          )}
        </p>
      </Notice>
    );
  }

  if (error instanceof GitHubError) {
    return (
      <Notice error title="GitHub returned an error">
        {error.message} (HTTP {error.status}). {tryAgain()}
      </Notice>
    );
  }

  if (error instanceof NetworkError) {
    return (
      <Notice error title="Couldn't reach GitHub">
        Check your internet connection, then {tryAgain("try again")}.
      </Notice>
    );
  }

  // A bug on our side. Log it so it isn't swallowed by the friendly message.
  console.error(error);
  return (
    <Notice error title={`Something went wrong while looking up @${username}.`}>
      {tryAgain()}
    </Notice>
  );
}
