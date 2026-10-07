// Sign out (POST only): clears the session cookies and returns to the home page.
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  // 303 so the browser follows with GET.
  return NextResponse.redirect(new URL("/", request.nextUrl.origin), { status: 303 });
}
