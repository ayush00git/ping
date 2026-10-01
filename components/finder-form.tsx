import Form from "next/form";
import type { Hints } from "@/lib/linkedin";

/** The details the user copies from the LinkedIn profile themselves. Submitting updates the URL. */
export default function FinderForm({ slug, hints, nameRequired }: { slug: string; hints: Hints; nameRequired: boolean }) {
  return (
    <Form
      action="/find"
      // Remount when the URL changes so the fields show the values in use.
      key={[slug, hints.name, hints.company, hints.city, hints.school].join("|")}
      className="mt-5 border-t border-line pt-5"
    >
      <input type="hidden" name="li" defaultValue={slug} />
      <p className="text-sm text-muted">
        ping doesn&apos;t open LinkedIn. Copy these from their profile to improve the match.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field name="name" label="Full name" defaultValue={hints.name ?? ""} required={nameRequired} />
        <Field name="company" label="Company" defaultValue={hints.company} />
        <Field name="city" label="City" defaultValue={hints.city} />
        <Field name="school" label="College" defaultValue={hints.school} />
      </div>
      <button
        type="submit"
        className="mt-5 cursor-pointer rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 active:scale-[.97] dark:text-bg"
      >
        Search again with these details
      </button>
    </Form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`hint-${name}`} className="text-sm font-medium">
        {label} <span className="font-normal text-muted">{required ? "(required)" : "(optional)"}</span>
      </label>
      <input
        id={`hint-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        autoComplete="off"
        className="mt-1.5 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
      />
    </div>
  );
}
