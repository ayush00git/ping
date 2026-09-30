import { statusLabel, type EmailKind } from "@/lib/emails";

export function SectionHeading({ id, title, scope }: { id: string; title: string; scope?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 id={id} className="text-lg font-semibold tracking-tight">
        {title}
      </h2>
      {scope && <p className="mt-1 text-sm text-muted">{scope}</p>}
    </div>
  );
}

export function Card({
  children,
  className = "",
  flush,
}: {
  children: React.ReactNode;
  className?: string;
  /** Less vertical padding, for cards that hold a list. */
  flush?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface px-5 sm:px-6 ${flush ? "py-2" : "py-5"} ${className}`}>
      {children}
    </div>
  );
}

export function Notice({
  title,
  children,
  error,
}: {
  title: string;
  children?: React.ReactNode;
  error?: boolean;
}) {
  return (
    <Card className="mt-10">
      <div role={error ? "alert" : "status"}>
        <p className={`font-medium ${error ? "text-danger" : ""}`}>{title}</p>
        {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
      </div>
    </Card>
  );
}

/**
 * The written status of an address. The emails panel shows the full reason; `short` (the commit
 * log) shows nothing for usable addresses and just "can't receive mail" otherwise.
 */
export function StatusLabel({ email, kind, short }: { email: string; kind: EmailKind; short?: boolean }) {
  if (short && kind === "personal") return null;
  return (
    <span
      className={`rounded-md border border-line px-1.5 py-px text-xs ${kind === "personal" ? "text-ink" : "text-muted"}`}
    >
      {short ? "can't receive mail" : statusLabel(email, kind)}
    </span>
  );
}

/** An address in mono that wraps at the @ first, and mid-word only if it still doesn't fit. */
export function Email({ email, className = "" }: { email: string; className?: string }) {
  const at = email.lastIndexOf("@");
  return (
    <span className={`font-mono [overflow-wrap:anywhere] ${className}`}>
      {at > 0 ? (
        <>
          {email.slice(0, at)}
          <wbr />
          {email.slice(at)}
        </>
      ) : (
        email
      )}
    </span>
  );
}

export function Sep() {
  return (
    <span aria-hidden className="text-muted">
      ·
    </span>
  );
}

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-line ${className}`} />;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
