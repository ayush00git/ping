import Form from "next/form";

export default function SearchForm({ defaultValue, className = "" }: { defaultValue: string; className?: string }) {
  return (
    <Form action="/" className={className}>
      <label htmlFor="u" className="sr-only">
        GitHub username or LinkedIn URL
      </label>
      <div className="flex items-center rounded-2xl border border-line bg-surface py-1.5 pr-1.5 pl-4 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
        <input
          // Remount when the URL changes so the field reflects the current user.
          key={defaultValue}
          id="u"
          name="u"
          defaultValue={defaultValue}
          placeholder="GitHub username or LinkedIn URL"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={!defaultValue}
          required
          className="min-w-0 flex-1 bg-transparent py-2.5 font-mono font-medium outline-none placeholder:font-sans placeholder:font-normal placeholder:text-muted"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-xl bg-accent px-4.5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 active:scale-[.97] dark:text-bg"
        >
          Look up
        </button>
      </div>
    </Form>
  );
}
