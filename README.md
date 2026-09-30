# ping

Enter a GitHub username to see their most recently created repository (forks skipped), which
commit emails in it can receive mail, and the commit log they came from. Click **Yes, add** to
put an address on your list. The list is saved in this browser's localStorage.

Next.js (App Router) · TypeScript · Tailwind CSS v4

```bash
npm install
npm run dev   # http://localhost:3000
```

Shareable links: `/?u=<username>` (add `&page=2` for older commits).

Unauthenticated GitHub requests are limited to 60/hour. To raise it to 5,000/hour, add a token
(no scopes needed) in `.env.local`:

```
GITHUB_TOKEN=ghp_...
```
