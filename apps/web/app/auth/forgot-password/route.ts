import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    if (email) {
      const supabase = await createSupabaseServerClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      });
    }
  } catch {
    // The response is intentionally indistinguishable to prevent account discovery.
  }
  return NextResponse.redirect(new URL("/forgot-password?sent=1", request.url), 303);
}
