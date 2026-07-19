import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cx("button", `button--${variant}`, `button--${size}`, className)}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...props} />;
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "violet";
  className?: string;
}) {
  return <span className={cx("badge", `badge--${tone}`, className)}>{children}</span>;
}

export function Avatar({
  initials,
  color = "teal",
}: {
  initials: string;
  color?: "teal" | "blue" | "amber" | "violet";
}) {
  return (
    <span className={cx("avatar", `avatar--${color}`)} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className="progress" aria-label={label ?? `Progress: ${normalized}%`}>
      <span className="progress__bar" style={{ width: `${normalized}%` }} />
    </div>
  );
}

export { cx };
