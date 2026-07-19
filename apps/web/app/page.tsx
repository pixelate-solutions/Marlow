import {
  ArrowRight,
  CheckCircle2,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main id="main-content" className="marketing">
      <nav className="marketing__nav" aria-label="Primary navigation">
        <Link className="brand" href="/" aria-label="Marlow home">
          <span className="brand-mark" />
          <span>Marlow</span>
        </Link>
        <div className="marketing__links">
          <a href="#how-it-works">How it works</a>
          <Link href="/sign-in">Sign in</Link>
          <Link className="button button--primary button--md" href="/onboarding">
            Start a campaign <ArrowRight size={15} />
          </Link>
        </div>
      </nav>
      <section className="marketing__hero">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            Grounded outreach, human approved
          </span>
          <h1>
            Meet the outbound rep who <em>does the homework.</em>
          </h1>
          <p className="marketing__lead">
            Describe your market once. Marlow finds the right people, researches every account, and
            prepares thoughtful emails you can trust—then waits for your approval.
          </p>
          <div className="marketing__actions">
            <Link className="button button--primary button--lg" href="/onboarding">
              Build your first campaign <ArrowRight size={17} />
            </Link>
            <Link className="button button--secondary button--lg" href="/dashboard">
              Explore the demo
            </Link>
          </div>
          <div className="marketing__proof">
            <div className="proof-faces" aria-hidden="true">
              <span>AM</span>
              <span>SC</span>
              <span>JR</span>
            </div>
            <span>Collaborative mode is always on. Nothing sends without your click.</span>
          </div>
        </div>
        <div className="hero-product" aria-label="Marlow product preview">
          <div className="hero-product__window">
            <div className="hero-product__bar">
              <i />
              <i />
              <i />
            </div>
            <div className="hero-product__content">
              <div className="hero-agent">
                <span className="hero-agent__icon">
                  <Sparkles size={16} />
                </span>
                <div className="hero-agent__bubble">
                  I found 12 operations leaders who match your campaign. I’m checking their
                  companies for timely, supportable outreach angles now.
                </div>
              </div>
              <div className="hero-research">
                <div className="hero-research__top">
                  <span>
                    <Search size={11} /> Researching Acme Automation
                  </span>
                  <span>3 sources</span>
                </div>
                <div className="hero-research__line" />
                <div className="hero-research__line" />
                <div className="hero-research__line" />
              </div>
              <div className="hero-draft">
                <div className="hero-draft__meta">
                  <span className="hero-draft__subject">Scaling operations</span>
                  <span className="badge badge--success">92 match</span>
                </div>
                <p>
                  Maya — I saw Acme is expanding the operations team as its Midwest footprint grows.
                  That often makes consistent handoffs harder across facilities…
                </p>
                <div className="hero-draft__footer">
                  <span className="button button--primary button--sm">
                    <CheckCircle2 size={13} /> Approve and send
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="trust-strip" id="how-it-works">
        <div className="trust-strip__inner">
          <div className="trust-item">
            <Search size={20} />
            <div>
              <strong>Research before writing</strong>
              <span>Every personalization point links to a public source.</span>
            </div>
          </div>
          <div className="trust-item">
            <UserRoundCheck size={20} />
            <div>
              <strong>You hold send authority</strong>
              <span>Exact drafts are hashed and approved one at a time.</span>
            </div>
          </div>
          <div className="trust-item">
            <ShieldCheck size={20} />
            <div>
              <strong>Compliance by construction</strong>
              <span>Suppression and limits are checked outside the model.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
