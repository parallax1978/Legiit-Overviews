// Marketing layout: white header with section links and a footer.
import type { ReactNode } from "react";
import { Footer } from "@/components/ui/footer";
import { Header } from "@/components/ui/header";
import { getCurrentUser } from "@/lib/auth";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="flex min-h-screen flex-col">
      <Header variant="marketing" signedIn={Boolean(user)} />
      <main className="flex-1">{children}</main>
      <Footer variant="marketing" />
    </div>
  );
}
