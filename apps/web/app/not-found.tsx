import { ArrowLeft, SearchX } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="empty-state">
      <span className="empty-state__icon">
        <SearchX />
      </span>
      <h2>That record isn’t here</h2>
      <p>It may have been removed, or it may belong to another workspace.</p>
      <Link className="button button--primary button--md" href="/dashboard">
        <ArrowLeft size={14} />
        Back to dashboard
      </Link>
    </main>
  );
}
