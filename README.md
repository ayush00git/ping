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

## MCP server

`npm run mcp` starts an MCP server over stdio, so an agent such as Claude Code can use ping. It
reads `GITHUB_TOKEN` from `.env.local` like the web app. Claude Code picks it up from `.mcp.json`
in this folder. For another client, run `npm --prefix /path/to/ping run --silent mcp`.

| Tool | What it does |
|---|---|
| `lookup_emails` | One GitHub user's commit emails, as on the results page: which can receive mail, and why not for the rest. |
| `find_github_from_linkedin` | GitHub accounts that might belong to one LinkedIn profile, graded Confirmed / Likely / Possible with evidence. Needs `GITHUB_TOKEN`. The agent is told to let you choose. |
| `add_to_list` | Puts one address that `lookup_emails` found on your list, like **Yes, add**. |

The list lives in the browser, so `add_to_list` writes to `.ping/list-inbox.jsonl` and any open
ping page adds new entries to its list within a few seconds. To keep lookups personal rather than
bulk, the server allows 30 lookups and 10 LinkedIn searches an hour.
