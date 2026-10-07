// Public Supabase settings. Only the URL and the anon (publishable) key ever reach the app.

/** The Supabase project URL and anon key from NEXT_PUBLIC_* env vars. */
export function supabaseEnv(): { url: string; anonKey: string } {
  // Referenced literally so Next.js inlines them into the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see web/.env.example).");
  }
  return { url, anonKey };
}
