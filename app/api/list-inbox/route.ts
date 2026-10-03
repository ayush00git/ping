import type { NextRequest } from "next/server";
import { newerThan, readInbox } from "@/lib/list-inbox";

// The list holds people's email addresses, so only answer pages served from this machine. A page on
// another site can't read the response anyway (no CORS header); this also stops DNS rebinding.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** People added from the MCP server after `?after=<addedAt>`, for components/list-inbox-sync.tsx. */
export async function GET(request: NextRequest) {
  if (!LOCAL_HOST.test(request.headers.get("host") ?? "")) return new Response(null, { status: 403 });
  const after = request.nextUrl.searchParams.get("after") ?? "";
  const items = newerThan(await readInbox(), after);
  return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
