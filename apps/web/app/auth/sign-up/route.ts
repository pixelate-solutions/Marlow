import { NextResponse } from "next/server";
import { assertCsrf } from "@/lib/security";
import { parseSignUpForm, signUpErrorMessage } from "@/lib/sign-up";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const input = parseSignUpForm(await request.formData());
    const supabase = await createSupabaseServerClient();
    const emailRedirectTo = new URL("/auth/callback?next=/onboarding", request.url).toString();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo,
      },
    });
    if (error) throw error;
    if (data.session) return NextResponse.redirect(new URL("/onboarding", request.url), 303);
    return NextResponse.redirect(new URL("/sign-up?success=1", request.url), 303);
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/sign-up?error=${encodeURIComponent(signUpErrorMessage(error))}`, request.url),
      303,
    );
  }
}
