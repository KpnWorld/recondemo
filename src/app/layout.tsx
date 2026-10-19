import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { config } from "@/lib/env";

export const metadata: Metadata = {
  title: {
    default: "Call Recon · Roadside Assistance, Reimagined.",
    template: "%s · Call Recon",
  },
  description: "Request trusted towing and roadside assistance in a few simple steps. Fast response. Clear pricing. Peace of mind.",
  applicationName: "Call Recon",
  robots: config.demoMode() ? { index: false, follow: false } : undefined,
};

export const viewport: Viewport = {
  themeColor: "#123B45",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {config.demoMode() ? (
          <div className="bg-gold px-4 py-2 text-center text-sm font-semibold text-deep" role="note">
            Demo environment. Requests, drivers and payments here are not real, and no one will be dispatched.
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
