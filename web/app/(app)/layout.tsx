// App shell for signed-in pages: white header (Queries, Notifications with unread count, account menu)
// over a surface-alt page, content in max-w-5xl.
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/ui/footer";
import { Header } from "@/components/ui/header";
import { getCurrentUser } from "@/lib/auth";
import { getUnreadCount } from "@/lib/queries";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // proxy.ts already redirects signed-out visitors with ?next=; this is the fallback.
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const unreadCount = await getUnreadCount();

  return (
    <div className="flex min-h-screen flex-col bg-surface-alt">
      <Header variant="app" email={user.email} unreadCount={unreadCount} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">{children}</main>
      <Footer variant="app" />
    </div>
  );
}
