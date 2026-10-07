// Supabase client for Client Components. The session lives in cookies shared with the server.
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

let browserClient: SupabaseClient | undefined;

/** The browser Supabase client (one per tab). Uses the signed-in user's session for RLS and functions. */
export function createClient(): SupabaseClient {
  if (!browserClient) {
    const { url, anonKey } = supabaseEnv();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
