"use client";
// RetryButton: re-runs the current route's server rendering (for ErrorCard actions in Server Components).
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, type ButtonProps } from "./button";
import { RefreshIcon } from "./icons";

/** Secondary "Try Again" button that calls router.refresh(). */
export function RetryButton({ children = "Try Again", ...props }: Omit<ButtonProps, "onClick" | "loading">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      iconLeft={<RefreshIcon />}
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
      {...props}
    >
      {children}
    </Button>
  );
}
