"use client";
// SegmentedControl: a pill radio group ("Desktop / Mobile / Both") with native keyboard behaviour.
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Form field name (radios submit with forms). Generated when omitted. */
  name?: string;
  /** Accessible name for the group when there is no visible label. */
  "aria-label"?: string;
  /** id of a visible label element. */
  "aria-labelledby"?: string;
  size?: "sm" | "md";
  /** Stretch segments to fill the width. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

/** Rounded track with a white raised pill on the selected option. Arrow keys move between options. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
  size = "md",
  fullWidth = false,
  disabled = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const generated = useId();
  const groupName = name ?? `seg-${generated}`;
  return (
    <div
      role="radiogroup"
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      className={cn("inline-flex rounded-full bg-surface-sunken p-1", fullWidth && "flex w-full", className)}
    >
      {options.map((o) => {
        const checked = o.value === value;
        const isDisabled = disabled || o.disabled;
        return (
          <label
            key={o.value}
            className={cn(
              "relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 rounded-full font-medium transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-brand",
              size === "md" ? "px-4 py-1.5 text-sm" : "px-3 py-1 text-xs",
              fullWidth && "flex-1",
              checked ? "bg-white text-ink shadow-sm ring-1 ring-line" : "text-ink-muted hover:text-ink",
              isDisabled && "cursor-not-allowed opacity-50",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={o.value}
              checked={checked}
              disabled={isDisabled}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
