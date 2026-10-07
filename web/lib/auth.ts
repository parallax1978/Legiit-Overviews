// Server-side session helpers, deduplicated per request with React cache().
import "server-only";
import { cache } from "react";
import { createClient } from "./supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/** The signed-in user from the verified session JWT, or null. One check per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
});
