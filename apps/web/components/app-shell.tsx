"use client";

import {
  Activity,
  Bell,
  ChevronDown,
  CircleGauge,
  FileCheck2,
  Menu,
  PlugZap,
  Search,
  Settings,
  Shield,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand } from "./brand";

type ShellIdentity = {
  workspaceName: string;
  workspaceLabel: string;
  userName: string;
  userLabel: string;
  initials: string;
};

const management = [
  { href: "/settings/sending", label: "Settings", icon: Settings },
  { href: "/settings/suppression", label: "Suppression", icon: Shield },
  { href: "/diagnostics", label: "Diagnostics", icon: Activity },
];

function NavLink({
  href,
  label,
  icon: Icon,
  count,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof CircleGauge;
  count?: number | undefined;
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  return (
    <Link
      className={`nav-link${active ? " nav-link--active" : ""}`}
      href={href}
      {...(onNavigate ? { onClick: onNavigate } : {})}
    >
      <Icon />
      <span>{label}</span>
      {count ? <b className="nav-count">{count}</b> : null}
    </Link>
  );
}

function SidebarContent({
  identity,
  reviewCount,
  onNavigate,
}: {
  identity: ShellIdentity;
  reviewCount: number;
  onNavigate?: (() => void) | undefined;
}) {
  const navigation = [
    { href: "/dashboard", label: "Dashboard", icon: CircleGauge },
    { href: "/campaigns", label: "Campaigns", icon: Target },
    {
      href: "/review",
      label: "Review queue",
      icon: FileCheck2,
      ...(reviewCount > 0 ? { count: reviewCount } : {}),
    },
    { href: "/integrations", label: "Integrations", icon: PlugZap },
  ];
  return (
    <>
      <Brand />
      <Link
        className="sidebar__workspace"
        href="/settings"
        {...(onNavigate ? { onClick: onNavigate } : {})}
      >
        <span className="workspace-icon">{identity.workspaceName.slice(0, 2).toUpperCase()}</span>
        <span>
          <strong>{identity.workspaceName}</strong>
          <span>{identity.workspaceLabel}</span>
        </span>
        <ChevronDown size={13} />
      </Link>
      <nav className="sidebar__nav" aria-label="Application navigation">
        {navigation.map((item) => (
          <NavLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
        <span className="sidebar__section">Manage</span>
        {management.map((item) => (
          <NavLink key={item.href} {...item} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="sidebar__bottom">
        <Link
          className="credits-mini"
          href="/review"
          {...(onNavigate ? { onClick: onNavigate } : {})}
        >
          <div className="credits-mini__top">
            <span>Review queue</span>
            <strong>{reviewCount} pending</strong>
          </div>
        </Link>
        <div className="user-mini">
          <span className="avatar avatar--teal">{identity.initials}</span>
          <div>
            <strong>{identity.userName}</strong>
            <span>{identity.userLabel}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function titleFromPath(pathname: string): string {
  if (pathname.startsWith("/campaigns/new")) return "New campaign";
  if (/^\/campaigns\/[^/]+/.test(pathname)) return "Campaign details";
  if (/^\/review\/[^/]+/.test(pathname)) return "Review draft";
  if (pathname.startsWith("/settings/sending")) return "Sending settings";
  if (pathname.startsWith("/settings/suppression")) return "Suppression list";
  return (
    pathname
      .split("/")
      .filter(Boolean)[0]
      ?.replace(/-/g, " ")
      .replace(/^./, (letter) => letter.toUpperCase()) ?? "Dashboard"
  );
}

export function AppShell({
  children,
  identity,
  reviewCount,
}: {
  children: React.ReactNode;
  identity: ShellIdentity;
  reviewCount: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <SidebarContent identity={identity} reviewCount={reviewCount} />
      </aside>
      {mobileOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="mobile-drawer__backdrop" onClick={() => setMobileOpen(false)} />
          <aside className="mobile-drawer__panel">
            <button
              className="icon-button mobile-drawer__close"
              type="button"
              aria-label="Close navigation"
              autoFocus
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </button>
            <SidebarContent
              identity={identity}
              reviewCount={reviewCount}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      ) : null}
      <div className="app-main">
        <header className="topbar">
          <div className="topbar__crumb">
            <button
              className="icon-button mobile-menu"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} />
            </button>
            <Sparkles size={14} />
            <span>Marlow</span>
            <span>/</span>
            <strong>{titleFromPath(pathname)}</strong>
          </div>
          <div className="topbar__actions">
            <button className="icon-button" type="button" aria-label="Search">
              <Search size={17} />
            </button>
            <button className="icon-button" type="button" aria-label="Notifications">
              <Bell size={17} />
            </button>
            <Link className="button button--primary button--sm" href="/campaigns/new">
              <Target size={14} />
              <span>New campaign</span>
            </Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}
