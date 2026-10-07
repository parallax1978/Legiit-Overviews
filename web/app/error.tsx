"use client";
// Error page for public routes (home, login): brand card with retry.
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/feedback";
import { RefreshIcon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-surface-alt px-4">
      <Logo />
      <ErrorCard
        className="w-full max-w-md"
        title="Something went wrong"
        detail={error.digest ? `Reference: ${error.digest}` : null}
        action={
          <>
            <Button onClick={reset} iconLeft={<RefreshIcon />}>
              Try Again
            </Button>
            <ButtonLink href="/" variant="secondary">
              Home
            </ButtonLink>
          </>
        }
      >
        This page hit an error on our side. Try again, and if it keeps happening, email help@legiit.com.
      </ErrorCard>
    </div>
  );
}
