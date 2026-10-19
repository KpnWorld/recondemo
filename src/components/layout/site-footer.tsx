import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { Logo } from "../logo";
import { Placeholder } from "../ui";

export async function SiteFooter() {
  const { business } = await getSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="on-dark mt-20 bg-deep text-white/85">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo dark />
          <p className="mt-3 text-sm text-white/70">Roadside Assistance, Reimagined.</p>
          <p className="mt-4 text-xs text-white/60">Call Recon is not an emergency service. If anyone is hurt or in danger, call 911.</p>
        </div>
        <FooterCol
          title="Get help"
          links={[
            ["/request", "Request a Tow"],
            ["/help", "Help center"],
            ["/help#contact", "Contact support"],
            ["/login", "Sign in"],
          ]}
        />
        <FooterCol
          title="Business"
          links={[
            ["/drive", "Become a Driver"],
            ["/legal/provider-requirements", "Provider requirements"],
            ["/legal/payments", "Pricing & payment disclosures"],
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            ["/legal/terms", "Terms of service"],
            ["/legal/privacy", "Privacy policy"],
            ["/legal/cancellation", "Cancellation policy"],
            ["/legal/refunds", "Refund policy"],
          ]}
        />
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-white/60 sm:flex-row sm:justify-between sm:px-6">
          <p>
            © {year} {business.legalName || "Call Recon"}
            {business.address ? ` · ${business.address}` : null}
          </p>
          {!business.legalName || !business.address ? (
            <p>
              <Placeholder>Business legal name and address are set in Admin → Settings</Placeholder>
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link href={href} className="text-sm text-white/75 no-underline hover:text-mint hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
