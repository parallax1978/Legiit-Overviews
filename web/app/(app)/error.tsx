"use client";
// Error boundary for app pages: keeps the header and shows a retry card.
import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/feedback";
import { RefreshIcon } from "@/components/ui/icons";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorCard
      title="This page didn't load"
      detail={error.digest ? `Reference: ${error.digest}` : null}
      action={
        <>
          <Button onClick={reset} iconLeft={<RefreshIcon />}>
            Try Again
          </Button>
          <ButtonLink href="/queries" variant="secondary">
            Back to Queries
          </ButtonLink>
        </>
      }
    >
      Something went wrong on our side. Try again, and if it keeps happening, email help@legiit.com.
    </ErrorCard>
  );
}
