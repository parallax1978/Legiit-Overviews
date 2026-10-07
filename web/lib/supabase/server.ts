// Supabase client for Server Components, Server Functions and Route Handlers.
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * A request-scoped Supabase client acting as the signed-in user (RLS applies).
 * Create one per request. In Server Components cookies are read-only, so session refreshes
 * are written by proxy.ts; setAll failures there are expected and ignored.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
