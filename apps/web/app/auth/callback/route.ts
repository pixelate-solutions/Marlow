import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));
  if (!code)
    return NextResponse.redirect(
      new URL("/sign-in?error=Missing%20authentication%20code", url),
      303,
    );
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(
      new URL(
        error ? "/sign-in?error=That%20confirmation%20link%20is%20invalid%20or%20expired." : next,
        url,
      ),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL("/sign-in?error=Email%20confirmation%20is%20temporarily%20unavailable.", url),
      303,
    );
  }
}
