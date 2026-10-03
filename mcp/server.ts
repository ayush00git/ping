// ping's MCP server: the web app's lookups as tools, over stdio. Start it with `npm run mcp`, which runs
// it under the react-server condition so lib/'s `import "server-only"` loads.
// stdout carries the protocol, so nothing may print to it; logs go to stderr.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools";

// Run from the project root whatever the client's working directory: .env.local and .ping/ live there.
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
// GITHUB_TOKEN, read the way the web app reads it. Variables already set in the environment win.
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

const server = new McpServer(
  { name: "ping", version: "0.1.0" },
  {
    instructions:
      "ping finds a developer's public commit email from their GitHub username or LinkedIn profile URL, and puts addresses on the user's recipient list. Look up one person at a time, and only people the user asks about. Never choose a LinkedIn match for the user, and add only addresses the user asked to add.",
  },
);
registerTools(server);

server.connect(new StdioServerTransport()).catch((e) => {
  console.error(e);
  process.exit(1);
});
