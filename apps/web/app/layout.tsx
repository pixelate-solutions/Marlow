import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Marlow — Your AI outbound teammate", template: "%s · Marlow" },
  description: "AI-powered lead generation and grounded, human-approved cold outreach.",
  applicationName: "Marlow",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#102824" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
