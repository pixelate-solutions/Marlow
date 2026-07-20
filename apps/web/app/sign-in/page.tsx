import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Sign in" };

const signInErrors: Record<string, { message: string; canReset?: boolean }> = {
  "invalid-credentials": {
    message: "That email and password combination did not work.",
    canReset: true,
  },
  "email-not-confirmed": {
    message: "Confirm your email address before signing in.",
  },
  "temporarily-unavailable": {
    message: "Sign-in is temporarily unavailable. Please try again shortly.",
  },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const signInError = error ? signInErrors[error] : undefined;
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/">
          <span className="brand-mark" />
          <span>Marlow</span>
        </Link>
        <div className="auth-story__copy">
          <h1>Your next best prospect is already out there.</h1>
          <p>
            Marlow finds the signal, checks the fit, and writes the first thoughtful note while you
            stay in control of every send.
          </p>
        </div>
        <blockquote className="auth-quote">
          <p>
            “It feels less like operating another sales tool and more like handing research to a
            teammate I trust.”
          </p>
          <span>Demo customer · Operations software</span>
        </blockquote>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">
            <Sparkles size={13} /> Welcome back
          </span>
          <h2>Sign in to Marlow</h2>
          <p className="auth-form__intro">Continue building thoughtful outbound campaigns.</p>
          {error ? (
            <div className="status-banner status-banner--error auth-error" role="alert">
              <span>{signInError?.message ?? error}</span>
              {signInError?.canReset ? (
                <Link href="/forgot-password">Reset your password</Link>
              ) : null}
            </div>
          ) : null}
          <form action="/auth/sign-in" method="post">
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="field">
              <div className="field__row">
                <label htmlFor="password">Password</label>
                <Link className="field__hint" href="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                minLength={8}
                required
              />
            </div>
            <button className="button button--primary button--lg" type="submit">
              Sign in <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            New to Marlow? <Link href="/sign-up">Create an account</Link>
          </p>
          {process.env.NODE_ENV !== "production" ? (
            <>
              <div className="auth-divider">or</div>
              <Link className="button button--secondary button--lg" href="/dashboard">
                Open deterministic demo
              </Link>
              <div className="demo-callout">
                <LockKeyhole size={15} /> Demo mode never connects to Apollo or sends real email.
              </div>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
