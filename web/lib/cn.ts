// Joins class names, skipping falsy values.

export type ClassValue = string | number | bigint | boolean | null | undefined;

/** Joins the string arguments with a space; everything else (false, null, 0, "") is skipped. */
export function cn(...classes: ClassValue[]): string {
  return classes.filter((c): c is string => typeof c === "string" && c.length > 0).join(" ");
}
