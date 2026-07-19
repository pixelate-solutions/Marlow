import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main id="main-content" className="auth-form-wrap" style={{ minHeight: "100vh" }}>
      <div className="auth-form card" style={{ padding: 30 }}>
        <span className="eyebrow">
          <KeyRound size={13} /> Account recovery
        </span>
        <h2>Reset your password</h2>
        <p className="auth-form__intro">
          Enter your work email. If it matches an account, Supabase will send a secure recovery
          link.
        </p>
        {sent ? (
          <div className="status-banner" role="status">
            If an account exists for that email, a recovery link is on its way.
          </div>
        ) : null}
        <form action="/auth/forgot-password" method="post">
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <button className="button button--primary button--lg" type="submit">
            Send recovery link <ArrowRight size={16} />
          </button>
        </form>
        <div style={{ marginTop: 18 }}>
          <Link className="field__hint" href="/sign-in">
            <ArrowLeft size={12} style={{ verticalAlign: -2 }} /> Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
