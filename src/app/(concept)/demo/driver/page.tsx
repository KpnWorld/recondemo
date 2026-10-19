import type { Metadata } from "next";
import { PageIntro } from "@/components/concept/page-intro";
import { DriverDemo } from "@/components/concept/driver-demo";

export const metadata: Metadata = { title: "Driver demo" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="Driver demo"
        title="Go online, take a job, finish it"
        text="Preview what a provider sees. Sample job only; no location is read or shared, and nothing is saved."
      />
      <DriverDemo />
    </div>
  );
}
