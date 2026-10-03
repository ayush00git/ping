import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hasToken } from "@/lib/github";
import { statusLabel } from "@/lib/emails";
import { nameFromSlug, parseLinkedInUrl, type Hints } from "@/lib/linkedin";
import { findAccounts } from "@/lib/resolve";
import { appendToInbox } from "@/lib/list-inbox";
import { budget } from "./budget";
import { lookup } from "./lookup";
import { errorText, formatFind, formatLookup, linkedInProblem, notAUsername, parseUsername } from "./present";

// A lookup costs about 3 GitHub requests; a LinkedIn search 5–28, including a code search.
const lookups = budget("lookups", 30);
const searches = budget("LinkedIn searches", 10);

const reply = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (text: string) => ({ ...reply(text), isError: true });

const username = z.string().describe('GitHub username. "@name" and github.com/name URLs work too.');

export function registerTools(server: McpServer) {
  server.registerTool(
    "lookup_emails",
    {
      title: "Look up a developer's commit emails",
      description:
        "Find the public commit emails of one GitHub user, the same lookup as ping's web app. It reads the user's most recently created repository (forks skipped) and their own commits in it, and says for each address whether it can receive mail, with the reason when it can't. One person per call.",
      inputSchema: { username },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ username }) => {
      const login = parseUsername(username);
      if (!login) return fail(notAUsername(username));
      try {
        return reply(formatLookup(await lookup(login, lookups.take)));
      } catch (e) {
        return fail(errorText(e, { username: login }));
      }
    },
  );

  server.registerTool(
    "find_github_from_linkedin",
    {
      title: "Find someone's GitHub account from their LinkedIn URL",
      description:
        "Find the GitHub account of the person behind one LinkedIn profile URL. Nothing is requested from linkedin.com: it searches GitHub for accounts that link to the profile, runs a name search and tries a few usernames, then grades each account Confirmed, Likely or Possible with written evidence. Details the user copied from the LinkedIn profile (name, company, city, college) make matches stronger. Never pick the person yourself: show the user the accounts and their evidence, let them say which one it is, then call lookup_emails with that username.",
      inputSchema: {
        linkedin_url: z.string().describe("A person's LinkedIn profile URL, linkedin.com/in/…"),
        name: z
          .string()
          .optional()
          .describe("Their full name. Read from the URL when it has one (dan-abramov-6b4a43 → Dan Abramov)."),
        company: z.string().optional().describe("Their current company, from the LinkedIn profile."),
        city: z.string().optional().describe("Their city, from the LinkedIn profile."),
        school: z.string().optional().describe("Their college, from the LinkedIn profile."),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ linkedin_url, name, company, city, school }) => {
      const parsed = parseLinkedInUrl(linkedin_url);
      if (parsed?.kind !== "profile") return fail(linkedInProblem(parsed));
      if (!hasToken()) {
        return fail(
          "The finder needs a GitHub token. Searching GitHub for pages that link to a LinkedIn profile only works when signed in. Add GITHUB_TOKEN to .env.local and restart the MCP server.",
        );
      }

      const { slug } = parsed;
      const fromUrl = nameFromSlug(slug);
      const hints: Hints = {
        name: name?.trim() || fromUrl,
        company: company?.trim() ?? "",
        city: city?.trim() ?? "",
        school: school?.trim() ?? "",
      };
      try {
        searches.take();
        return reply(formatFind(slug, hints, fromUrl, await findAccounts(slug, hints)));
      } catch (e) {
        return fail(
          errorText(e, {
            username: slug,
            subject: "this LinkedIn profile",
            rateLimitNote:
              "The search for pages that link to this profile uses GitHub's code search, which allows 10 searches a minute.",
          }),
        );
      }
    },
  );

  server.registerTool(
    "add_to_list",
    {
      title: "Add an email to the list",
      description:
        'Put one email address on the recipient list in ping\'s web app, like its "Yes, add" button. Only an address that lookup_emails lists under "Can receive mail" for that user is accepted. Add only addresses the user asked for. The person shows up in the list in the user\'s browser within a few seconds while a ping page is open, or the next time one is opened.',
      inputSchema: {
        username,
        email: z.string().describe("One of the addresses lookup_emails listed for this user."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ username, email }) => {
      const login = parseUsername(username);
      if (!login) return fail(notAUsername(username));
      const address = email.trim().toLowerCase();

      let found;
      try {
        found = await lookup(login, lookups.take);
      } catch (e) {
        return fail(errorText(e, { username: login }));
      }
      const { repo } = found;
      const c = found.candidates.find((c) => c.email === address);
      if (!repo || !c) {
        return fail(
          `${address} isn't one of the commit emails ping found for @${found.login}${repo ? ` in ${repo.name}` : ""}. Call lookup_emails and use an address it lists under "Can receive mail".`,
        );
      }
      if (c.kind !== "personal") return fail(`${address} can't be added: ${statusLabel(c.email, c.kind)}.`);

      try {
        await appendToInbox({
          email: c.email,
          name: c.name,
          username: found.login,
          repo: repo.name,
          repoUrl: repo.html_url,
          addedAt: new Date().toISOString(),
          status: "ready",
        });
      } catch (e) {
        console.error(e);
        return fail(`Couldn't save ${c.email} for the list: ${e instanceof Error ? e.message : "unknown error"}.`);
      }
      return reply(
        `Added ${c.email} (${c.name}, from @${found.login}/${repo.name}) to the list. It shows up in ping's list in the browser within a few seconds while a ping page is open, or the next time one is opened. If the address is already on the list, nothing changes.`,
      );
    },
  );
}
