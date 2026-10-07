// Button and ButtonLink: fully rounded pills in primary, secondary, ghost and danger variants.
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LoaderIcon } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background-color,box-shadow,color] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap aria-disabled:opacity-50 aria-disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-strong hover:shadow-glow",
  secondary: "bg-white text-ink ring-1 ring-inset ring-line shadow-sm hover:bg-surface-alt hover:ring-line-strong",
  ghost: "text-ink-muted hover:bg-surface-sunken hover:text-ink",
  danger: "bg-bad text-white shadow-sm hover:bg-[#991b1b]",
  // White pill for dark (plum) backgrounds.
  dark: "bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/15",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-base",
  // Hero and section CTAs.
  xl: "px-6 py-3.5 text-lg sm:gap-3 sm:px-7 sm:py-3 sm:text-2xl",
};

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Adds the purple glow used on call-to-action buttons. */
  glow?: boolean;
  fullWidth?: boolean;
  className?: string;
}

/** Class names for a pill button; use on any element. */
export function buttonClasses({ variant = "primary", size = "md", glow = false, fullWidth = false, className }: ButtonStyleProps = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], glow && "shadow-glow", fullWidth && "w-full", className);
}

interface ContentProps {
  /** Icon before the label. */
  iconLeft?: ReactNode;
  /** Icon after the label (e.g. <ChevronRightIcon />). */
  iconRight?: ReactNode;
  children?: ReactNode;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps, ContentProps {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
}

/** A <button> pill. Defaults to type="button". */
export function Button({
  variant,
  size,
  glow,
  fullWidth,
  className,
  iconLeft,
  iconRight,
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, glow, fullWidth, className })}
      {...props}
    >
      {loading ? <LoaderIcon className="animate-spin" /> : iconLeft}
      {children}
      {iconRight}
    </button>
  );
}

export interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, "className" | "children">, ButtonStyleProps, ContentProps {
  /** Opens in a new tab with rel="noreferrer noopener". */
  external?: boolean;
}

/** A next/link styled as a pill button. */
export function ButtonLink({ variant, size, glow, fullWidth, className, iconLeft, iconRight, external, children, ...props }: ButtonLinkProps) {
  return (
    <Link
      className={buttonClasses({ variant, size, glow, fullWidth, className })}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      {...props}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Link>
  );
}
