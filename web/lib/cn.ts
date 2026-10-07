// Joins class names, skipping falsy values.

export type ClassValue = string | false | null | undefined | 0;

/** Joins truthy class names with a space. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
