// 404 page in the brand style: plum panel with the logo, a short message and ways back.
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { Eyebrow } from "@/components/ui/typography";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="hero-dark flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl px-4 py-5">
        <Logo tone="dark" />
      </div>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 pb-24">
        <Eyebrow tone="soft">404 · Page not found</Eyebrow>
        <h1 className="mt-4 max-w-xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          This page isn&rsquo;t in the overview.
          <span className="text-gradient block">Let&rsquo;s get you back.</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-white/75">
          The link may be old, or the page may have moved. Your queries are where you left them.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/queries" size="lg" glow iconRight={<ChevronRightIcon />}>
            Go to Queries
          </ButtonLink>
          <ButtonLink href="/" size="lg" variant="dark">
            Home
          </ButtonLink>
        </div>
      </main>
    </div>
  );
}
