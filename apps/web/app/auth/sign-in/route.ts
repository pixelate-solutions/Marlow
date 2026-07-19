import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertCsrf, safeRedirectPath } from "@/lib/security";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const form = await request.formData();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const redirectTo = safeRedirectPath(String(form.get("redirectTo") ?? "/dashboard"));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error)
      return NextResponse.redirect(
        new URL(
          `/sign-in?error=${encodeURIComponent("Email or password was not recognized.")}`,
          request.url,
        ),
        303,
      );
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch {
    return NextResponse.redirect(
      new URL(
        `/sign-in?error=${encodeURIComponent("Authentication is not configured for this environment.")}`,
        request.url,
      ),
      303,
    );
  }
}
