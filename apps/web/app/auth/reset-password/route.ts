import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const form = await request.formData();
    const password = String(form.get("password") ?? "");
    if (password.length < 8) throw new Error("Password must contain at least eight characters.");
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return NextResponse.redirect(new URL("/dashboard", request.url), 303);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The recovery session is invalid or expired.";
    return NextResponse.redirect(
      new URL(`/reset-password?error=${encodeURIComponent(message)}`, request.url),
      303,
    );
  }
}
