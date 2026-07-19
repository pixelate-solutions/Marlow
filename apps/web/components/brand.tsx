import Link from "next/link";

export function Brand({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="Marlow home">
      <span className="brand-mark" />
      <span>Marlow</span>
    </Link>
  );
}
