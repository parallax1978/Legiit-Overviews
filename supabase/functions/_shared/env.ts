// Environment access for Edge Functions. Supabase injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.

function get(name: string): string | undefined {
  const v = Deno.env.get(name);
  return v === undefined || v === "" ? undefined : v;
}

function required(name: string): string {
  const v = get(name);
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  supabaseUrl: () => required("SUPABASE_URL"),
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  anonKey: () => get("SUPABASE_ANON_KEY") ?? "",

  dataforseoLogin: () => required("DATAFORSEO_LOGIN"),
  dataforseoPassword: () => required("DATAFORSEO_PASSWORD"),
  dataforseoBaseUrl: () => get("DATAFORSEO_BASE_URL") ?? "https://api.dataforseo.com",

  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
  anthropicBaseUrl: () => get("ANTHROPIC_BASE_URL"),

  postbackSecret: () => required("POSTBACK_SECRET"),
  cronSecret: () => required("CRON_SECRET"),
  /** Public base URL of the functions, used for DataForSEO postbacks. */
  functionsPublicUrl: () => get("FUNCTIONS_PUBLIC_URL") ?? `${required("SUPABASE_URL")}/functions/v1`,

  resendApiKey: () => get("RESEND_API_KEY"),
  emailFrom: () => get("EMAIL_FROM") ?? "Legiit Overviews <alerts@legiit.com>",
  appUrl: () => get("APP_URL") ?? "http://localhost:3000",
};
