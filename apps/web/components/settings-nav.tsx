import { Building2, Mail, Shield, UserRound } from "lucide-react";
import Link from "next/link";

export function SettingsNav({
  current,
}: {
  current: "sending" | "suppression" | "workspace" | "profile";
}) {
  const links = [
    { href: "/settings", label: "Workspace", id: "workspace", icon: Building2 },
    { href: "/settings/sending", label: "Sending", id: "sending", icon: Mail },
    { href: "/settings/suppression", label: "Suppression", id: "suppression", icon: Shield },
    { href: "/settings/profile", label: "Profile", id: "profile", icon: UserRound },
  ];
  return (
    <nav className="card settings-nav" aria-label="Settings navigation">
      {links.map(({ href, label, id, icon: Icon }) => (
        <Link key={id} href={href} aria-current={current === id ? "page" : undefined}>
          <Icon size={14} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
