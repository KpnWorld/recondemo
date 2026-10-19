import type { Metadata } from "next";
import { PageIntro } from "@/components/concept/page-intro";
import { AdminDemo } from "@/components/concept/admin-demo";

export const metadata: Metadata = { title: "Operations demo" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="Operations demo"
        title="Dispatch, approvals and pricing in one place"
        text="A look at the admin side with sample requests and applicants. Nothing is saved or sent."
      />
      <AdminDemo />
    </div>
  );
}
