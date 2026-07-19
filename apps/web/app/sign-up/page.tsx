import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  return (
    <main id="main-content" className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/">
          <span className="brand-mark" />
          <span>Marlow</span>
        </Link>
        <div className="auth-story__copy">
          <h1>Turn a clear market idea into thoughtful outreach.</h1>
          <p>
            Create your workspace, connect Apollo, and let Marlow research the right prospects—one
            human-approved message at a time.
          </p>
        </div>
        <blockquote className="auth-quote">
          <p>Every account starts private. Every send stays behind your explicit approval.</p>
          <span>Secure by default · No automatic sending</span>
        </blockquote>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">
            <Sparkles size={13} /> Start with Marlow
          </span>
          <h2>Create your account</h2>
          <p className="auth-form__intro">
            Your first account also creates a private workspace for your campaigns.
          </p>
          {error ? (
            <div className="status-banner status-banner--error" role="alert">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="status-banner" role="status">
              Check your inbox to confirm your email, then Marlow will open your new workspace.
            </div>
          ) : null}
          <form action="/auth/sign-up" method="post">
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input
                className="input"
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                placeholder="Maya Chen"
                minLength={2}
                maxLength={100}
                required
              />
            </div>
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
              <label htmlFor="password">Password</label>
              <input
                className="input"
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
                minLength={10}
                maxLength={128}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                className="input"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Enter it again"
                minLength={10}
                maxLength={128}
                required
              />
            </div>
            <button className="button button--primary button--lg" type="submit">
              Create account <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-legal">
            <ShieldCheck size={14} /> By continuing, you agree to use Marlow for lawful,
            permission-aware business outreach.
          </p>
          <p className="auth-switch">
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
