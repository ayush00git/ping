# ping — plan

Enter a GitHub username → find their most recent repo → list commits with `.patch` links and
author emails → click **Yes** on the emails you want → send a personalised email to everyone on
that list in one go.

## Where we are

**Updated 2026-09-30.** Phases 1 and 2 are built and committed (`fabe71a`):

- `app/page.tsx`: the empty homepage centres the search. `?u=<username>&page=<n>` shows the results under a compact top bar.
- `lib/github.ts` (`server-only`): `getLatestRepo()`, `getCommits()`, `getAuthorCommits()`, rate-limit and network errors.
- `lib/emails.ts`: `classify`, `statusLabel`, `parseCoAuthors`, `collectCandidates`.
- `lib/shortlist.ts`: the recipient list in `localStorage`.
- `components/`: repo summary, "Emails found" panel with **Yes, add**, commit log, recipient tray, error states.

Phase 5 (LinkedIn → GitHub finder at `/find`) is done. The `/list` page (review, remove with undo, filter, CSV export) is done. Phase 3 (compose and send) hasn't started.
All code is written by one session (**designer-bruh**) and reviewed by the planner session.

## Facts checked against the live API (2026-09-30)

| Question | Answer |
|---|---|
| Where is the email? | `GET /repos/{o}/{r}/commits` already returns `commit.author.email`, `commit.author.name` and `commit.committer.email`. **There's no need to download the `.patch`.** It holds the same `From: Name <email>` line. |
| Correct patch URL | `https://github.com/{owner}/{repo}/commit/{sha}.patch`. The form without `/commit/` returns **404**. |
| Can the browser fetch `.patch`? | No. `github.com` sends no `Access-Control-Allow-Origin`, so we only link to it. (`api.github.com` does send `*`, but we call it from the server so the token stays hidden.) |
| Rate limit | 60 req/h without a token, 5000 req/h with `GITHUB_TOKEN`. One lookup costs about 3 requests, so set the token. |
| Hidden emails | Users with email privacy turned on commit as `12345+login@users.noreply.github.com`. Web-UI commits have committer `noreply@github.com`. These can't receive mail and must be filtered out. |

## Flow

```
[username] ──► server: getUser + getLatestRepo + getAuthorCommits
                 │
                 ▼
          Results page
          ├─ repo card
          ├─ "Emails found" panel ── [Yes, add] ──► Shortlist (localStorage)
          └─ commit log (each row: sha · email · .patch link)
                                                     │
                            Recipients tray "4 in list → Compose"
                                                     │
                                                     ▼
          /compose: subject + body with {{tokens}}, live preview, "Send test to me"
                                                     │  loop, one Server Action per recipient
                                                     ▼
          sendOne() ─► Nodemailer SMTP ─► per-row status: queued → sending → sent / failed (retry)
                                                     │
                                                     ▼
                                   sent log (localStorage) ─► "emailed 3 d ago" badge on future lookups
```

## Phase 1: extract emails and add `.patch` links

**`lib/github.ts`** (small edits)
- Widen `Commit.commit.author` to `{ name; email; date }` and add `committer: { name; email; date }`.
- `getUser(username)` → `GET /users/{u}` (gives `name` and the public profile `email`, which is often null).
- `getAuthorCommits(fullName, username)` → `GET /repos/{r}/commits?author={u}&per_page=100`.
  This is separate from the paginated log, so the email panel doesn't depend on which log page is open.
- `getLatestRepo`: **decided (2026-09-30): keep it as is.** Pick the most recently *created*
  repo, skip forks, and don't fall back to another repo. The UI states this rule. If the user has
  no commits in that repo, the email panel explains that it's empty.
- **Email panel scope, decided (2026-09-30):** list only the looked-up user's own commits
  (`getAuthorCommits`) plus the co-authors they credited. Collaborators' addresses appear only in
  the commit log.
- `patchUrl(fullName, sha)` → `https://github.com/${fullName}/commit/${sha}.patch`.

**`lib/emails.ts`** (new, pure functions, no I/O, so it's easy to unit test)
- `classify(email)` returns `"personal" | "noreply" | "bot"`:
  - noreply: `*@users.noreply.github.com`, `noreply@github.com`, `*@localhost`, `*.local`, anything without a dot in the domain
  - bot: `[bot]` in the name/login, `dependabot`, `github-actions`, `renovate`
- `parseCoAuthors(message)`: `Co-authored-by: Name <email>` trailers.
- `collectCandidates({ commits, username, fullName, profileEmail })` returns `EmailCandidate[]`.
  Dedupe by lowercased email. Set `isUser` when `c.author?.login` matches the username
  (case-insensitive). Sort order: `isUser` first, then `personal` before `noreply`/`bot`, then by commit count.

**UI (UI session):** an "Emails found" card above the log. Each commit row gets an email chip and a
`.patch` link. If the only candidates are noreply ones, show an empty state: *"No public email.
All commits use GitHub's noreply address."*

## Phase 2: shortlist (the "Yes" button)

**`lib/shortlist.ts`** (new, `"use client"`): a small store built on `localStorage` and
`useSyncExternalStore`.
- `useShortlist()` returns `{ items, add(r), remove(email), clear(), has(email), setStatus(email, s) }`.
- Keyed by email, so adding the same address twice does nothing. It syncs across tabs through the `storage` event.
- `useSentLog()` returns a map of `email → sentAt`. It survives `clear()`, so already-emailed people get a badge on later lookups.
- Export the list as CSV (a small nice-to-have).

`localStorage` is enough because this is a single-user personal tool. Move to SQLite only if it ever needs history across devices.

**UI (UI session):** a **Yes / Added ✓** toggle per candidate (disabled for noreply/bot rows).
A persistent tray or bottom bar showing "N in list → Compose", which lets you remove items.

## Phase 3: compose and send

**Dependencies:** `npm i nodemailer` and `npm i -D @types/nodemailer`.

**`.env.local`**
```
GITHUB_TOKEN=ghp_…                # read-only, no scopes needed
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=you@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx     # Gmail App Password (requires 2FA)
MAIL_FROM="Your Name <you@gmail.com>"
MAIL_DRY_RUN=1                    # jsonTransport: logs instead of sending
APP_PASSWORD=…                    # only needed if deployed (see Phase 4)
```

**`lib/mailer.ts`** (new, `server-only`)
- A lazy singleton Nodemailer transport. Use `jsonTransport` when `MAIL_DRY_RUN=1`.
- `render(template, vars)` replaces `{{name}}`, `{{firstName}}`, `{{username}}`, `{{repo}}` and
  `{{repoUrl}}`. Unknown tokens are left as they are, and the preview shows them in red.

**`app/actions.ts`** (new, `'use server'`)
```ts
sendOne(input: { to: string; vars: TemplateVars; subject: string; body: string })
  : Promise<{ ok: true; id: string } | { ok: false; error: string }>
```
- Validate `to` against an email regex, cap subject at 200 chars and body at 20 KB, and strip CR/LF from the subject.
- Send **one message per recipient** with a single `to:`. Never put the list in To/CC, because that leaks everyone's address.
- Return errors instead of throwing, so a failed row doesn't stop the batch.

**Send loop (client, on the compose page):** go through the shortlist and `await sendOne()` for each
recipient, with a 3–5 s gap between sends. Update each row's status as it goes. Add a
**Stop** button and **Retry failed**. Server Actions already run one at a time per client
(Next 16 docs, *Sequential dispatch*), which fits this loop and gives live progress without SSE.

**Limits to show in the UI:** consumer Gmail allows about 500 recipients a day and Workspace about 2000.
Show "N queued" and warn above about 100.

**UI (UI session):** a `/compose` page (or drawer) with subject, body, clickable token chips, a
recipient picker for the live preview, **Send test to me**, then **Send to N** with a status list for each row.

## Phase 4: hardening

- **Auth gate.** A Server Action is a public POST endpoint (Next 16 docs: *"reachable to anyone who
  can send the same POST"*). A deployed, unprotected `sendOne` would let anyone send mail through
  your Gmail. Either run it only on `localhost`, or add `proxy.ts` (Next 16's replacement for
  middleware) that checks a cookie set from `APP_PASSWORD`. `sendOne` must check the cookie itself too.
- Server-side throttle in `sendOne`: at least 2 s between sends per process, as a backstop to the client delay.
- GitHub rate limit: `lib/github.ts` already shows the reset time. Keep `revalidate: 60` caching.
- Put a one-line opt-out in the default template. Sends must stay manual, personal and low volume (see note below).

## Phase 5: LinkedIn URL → GitHub account

Paste a LinkedIn profile URL instead of a username. ping finds the person's GitHub account,
including when their LinkedIn never mentions GitHub. The tool stays local. It uses no paid
services and needs `GITHUB_TOKEN` (code search requires auth).

**Rules**
- ping never requests anything from `linkedin.com`. LinkedIn's User Agreement forbids scraping,
  logged-out visitors get a login wall, and the official API only returns the signed-in member's
  own profile. The URL is only a clue.
- ping never picks the person. The user confirms with **This is them**, and every result shows its evidence as text.
- One person at a time. No list import, no photo/face matching, and resolved mappings aren't stored.

**Steps**
1. `lib/linkedin.ts` (pure): `parseLinkedInUrl()` → slug; `nameFromSlug()` drops a trailing ID
   (`dan-abramov-6b4a43` → "Dan Abramov") and returns null for custom slugs (`/in/danabra`).
2. Finder page `/find?li=<slug>&name=&company=&city=&school=`. The user copies hints from the profile themselves.
3. `lib/resolve.ts` (`server-only`) finds possible accounts:
   - **Links back.** Code search for `linkedin.com/in/<slug>`. Search ignores punctuation, so the
     exact slug is checked in text-match fragments. A hit only counts for the repo's owner.
   - **Name search.** `search/users?q=fullname:<name>`, unquoted (quoted returns 0), plus `location:<city>`.
   - **Username guesses.** At most 5, via `GET /users/{guess}`.
   - **Checks.** For each account (at most 10): `GET /users/{u}` + `GET /users/{u}/social_accounts`.
4. Tiers:

   | Tier | Evidence |
   |---|---|
   | Confirmed | The account links to this exact LinkedIn profile from its own profile: social accounts, bio, website, `<login>/<login>` README, or `<login>.github.io` |
   | Likely | Another repo the account owns links to it, or the name matches plus company/city/college |
   | Possible | Only the name matches. Shown with a warning |

5. **This is them** → `/?u=<login>` (the existing lookup).

**Decided during review (2026-10-01):**
- Company/city/college match on whole words. City compares only the most specific place, so "India" doesn't match "New Delhi, India".
- A name counts as a full match when one contains the other with 2+ words ("John Smith" ⊂ "John Michael Smith"). A single word is partial and can't make Likely.
- Common names (over 100 GitHub accounts) need 2 matching details for Likely.
- An account linking a *different* LinkedIn profile goes to a collapsed **Ruled out** group.
- The filled "This is them" button goes only to a single best match. Ties get outlined buttons and a "compare them" note.
- Tests: `npm test` (node:test, no extra dependencies).

**Limits:** people with no GitHub account, or who use a pseudonym and never link LinkedIn, can't
be found. Common names without hints give many "Possible" results.

## Types (the contract)

```ts
// lib/emails.ts
export type EmailKind = "personal" | "noreply" | "bot";
export type EmailCandidate = {
  email: string;        // lowercased
  name: string;         // most frequent author name for this address
  kind: EmailKind;      // only "personal" can be added
  isUser: boolean;      // linked to the looked-up login (vs. a collaborator)
  source: "commit" | "co-author" | "profile";
  commits: number;      // commits that used this address
  lastSeen: string;     // ISO date
  sha: string;          // newest commit using it
  patchUrl: string;     // https://github.com/o/r/commit/<sha>.patch
};

// lib/shortlist.ts
export type Recipient = {
  email: string; name: string; username: string;
  repo: string; repoUrl: string; addedAt: string;
  status: "ready" | "sending" | "sent" | "failed";
  sentAt?: string; error?: string;
};
export type TemplateVars = { name: string; firstName: string; username: string; repo: string; repoUrl: string };
```

`Results` (server) computes `EmailCandidate[]` and passes it, together with `{ username, repo, repoUrl }`,
to a client component that uses `useShortlist()`.

## Testing

- Unit tests for `lib/emails.ts` with Vitest: noreply/bot classification, co-author parsing, dedupe/sort, case-insensitive login match.
- Manual check: look up `gaearon`. As of 2026-09-30 it shows repo `conway-refinement` and the public email
  `dan.abramov@gmail.com`, with a `.patch` link that opens. `octocat` gives an empty panel under the "created" rule,
  because its newest repo, `test-repo1`, has no commits by octocat. Add it, compose, and send with `MAIL_DRY_RUN=1` (check the server log).
  Then do one real send **to yourself** before anyone else.
- A user with email privacy turned on should show the "no public email" empty state.

## Note on use

GitHub's Acceptable Use Policies forbid using data from GitHub to send unsolicited *bulk/spam*
email, and CAN-SPAM/GDPR apply to cold outreach. The design keeps sends individual, hand-picked,
personalised, throttled and deduplicated, with an opt-out line. Keep it that way, and don't add
auto-select-all or scraping of many users at once.

## Order of work

1. ~~`lib/emails.ts` and the `lib/github.ts` changes~~ (done; Vitest tests still to add)
2. ~~`lib/shortlist.ts` store~~ (done)
3. ~~Email panel, Yes toggle, tray~~ (done)
4. ~~Phase 5: LinkedIn → GitHub finder~~ (done)
5. ~~`/list` page: review and manage the recipient list~~ (done)
6. `lib/mailer.ts` + `app/actions.ts` (dry run first), then `/compose`
7. Auth gate, only if it's ever deployed (currently local only)
