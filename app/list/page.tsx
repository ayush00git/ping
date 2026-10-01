import type { Metadata } from "next";
import ListManager from "@/components/list-manager";
import { Footer, TopBar } from "@/components/page-chrome";

export const metadata: Metadata = { title: "ping · your list" };

// The list lives in this browser's localStorage, so the page is a shell around a client component.
// No tray here: it would repeat this page.
export default function ListPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
      <TopBar defaultValue="" autoFocus={false} />
      <ListManager />
      <Footer className="mt-20" />
    </main>
  );
}
