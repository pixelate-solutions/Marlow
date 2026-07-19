import { ArrowRight, KeyRound } from "lucide-react";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main id="main-content" className="auth-form-wrap" style={{ minHeight: "100vh" }}>
      <div className="auth-form card" style={{ padding: 30 }}>
        <span className="eyebrow">
          <KeyRound size={13} /> Secure recovery
        </span>
        <h2>Choose a new password</h2>
        <p className="auth-form__intro">
          Use at least eight characters. Your recovery session is verified before the password
          changes.
        </p>
        {error ? (
          <div className="status-banner status-banner--error" role="alert">
            {error}
          </div>
        ) : null}
        <form action="/auth/reset-password" method="post">
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <button className="button button--primary button--lg" type="submit">
            Update password <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </main>
  );
}
