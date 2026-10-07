// Form controls: Label, Field (label + hint + error), Input, Textarea and Select, 40px tall with brand focus rings.
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { ChevronDownIcon } from "./icons";

const CONTROL =
  "w-full rounded-lg border bg-white text-sm text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-soft focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-ink-muted";

function controlBorder(invalid?: boolean) {
  return invalid ? "border-bad focus:border-bad focus:ring-bad/15" : "border-line";
}

/** 14px medium label. */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink", className)} {...props} />;
}

export interface FieldProps {
  /** id of the control inside; the label points at it. Hint and error get `${id}-hint` / `${id}-error`. */
  id: string;
  label: ReactNode;
  /** Muted help text under the control. */
  hint?: ReactNode;
  /** Error text under the control (red, announced). */
  error?: ReactNode;
  /** Content on the right of the label row (e.g. a "Forgot?" link). */
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control and messages. Point the control at the messages with
 * aria-describedby={describedBy(id, { hint, error })}.
 */
export function Field({ id, label, hint, error, labelAside, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

/** The aria-describedby value for a Field's control. */
export function describedBy(id: string, { hint, error }: { hint?: unknown; error?: unknown }): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Red border and aria-invalid. */
  invalid?: boolean;
  /** Icon inside the input on the left. */
  icon?: ReactNode;
}

/** Text input: 40px, white, line border, 8px radius. */
export function Input({ invalid, icon, className, ...props }: InputProps) {
  const input = (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, controlBorder(invalid), "h-10 px-3", icon && "pl-9", className)}
      {...props}
    />
  );
  if (!icon) return input;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-soft">{icon}</span>
      {input}
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/** Multi-line input with the same styling as Input. */
export function Textarea({ invalid, className, rows = 6, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, controlBorder(invalid), "px-3 py-2.5 leading-6", className)}
      {...props}
    />
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Options as data; or pass <option> children. */
  options?: { value: string; label: string; disabled?: boolean }[];
  /** Classes for the wrapper (width). */
  wrapperClassName?: string;
}

/** Native select styled like Input, with a chevron. */
export function Select({ invalid, options, wrapperClassName, className, children, ...props }: SelectProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, controlBorder(invalid), "h-10 appearance-none pl-3 pr-9", className)}
        {...props}
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft" />
    </div>
  );
}
