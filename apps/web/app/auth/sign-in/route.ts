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
    if (error) {
      console.warn("[auth] Password sign-in rejected", {
        code: error.code ?? "unknown",
        status: error.status ?? null,
      });
      const errorCode =
        error.code === "email_not_confirmed" ? "email-not-confirmed" : "invalid-credentials";
      return NextResponse.redirect(
        new URL(`/sign-in?error=${errorCode}`, request.url),
        303,
      );
    }
    return NextResponse.redirect(new URL(redirectTo, request.url), 303);
  } catch (error) {
    console.error("[auth] Password sign-in could not run", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.redirect(
      new URL("/sign-in?error=temporarily-unavailable", request.url),
      303,
    );
  }
}
