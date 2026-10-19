import type { Metadata } from "next";
import { ConceptBanner, ConceptFooter, ConceptHeader } from "@/components/concept/shell";

export const metadata: Metadata = {
  description: "A concept preview of Call Recon: on-demand towing and roadside assistance with clear pricing. Not yet taking requests.",
};

// These pages never read the database: the launch page and demos are static content plus in-browser sample state.
export default function ConceptLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ConceptBanner />
      <ConceptHeader />
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>
      <ConceptFooter />
    </>
  );
}
