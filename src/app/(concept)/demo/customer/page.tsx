import type { Metadata } from "next";
import { PageIntro } from "@/components/concept/page-intro";
import { CustomerDemo } from "@/components/concept/customer-demo";

export const metadata: Metadata = { title: "Customer demo" };

export default function CustomerDemoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="Customer demo"
        title="Request help, start to finish"
        text="Click through the customer journey. Everything here is sample content held in your browser tab; nothing is sent, saved or charged."
      />
      <CustomerDemo />
    </div>
  );
}
