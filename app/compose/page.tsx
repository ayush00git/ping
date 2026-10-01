import type { Metadata } from "next";
import Composer from "@/components/composer";
import { Footer, SHELL, TopBar } from "@/components/page-chrome";
import { mailStatus } from "@/lib/mailer";
import { fromName } from "@/lib/template";

export const metadata: Metadata = { title: "ping · new email" };

// Reads the mail settings on every request, so editing .env.local and restarting shows up right away.
export const dynamic = "force-dynamic";

export default function ComposePage() {
  const status = mailStatus();
  return (
    <main className={`${SHELL} pt-6 sm:pt-8`}>
      <TopBar defaultValue="" autoFocus={false} />
      <Composer status={status} senderName={fromName(status.from)} />
      <Footer className="mt-20" />
    </main>
  );
}
