import type { Metadata } from "next";
import { PageIntro } from "@/components/concept/page-intro";
import { EngineDemo } from "@/components/concept/engine-demo";

export const metadata: Metadata = { title: "Dispatch engine demo" };

export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <PageIntro
        eyebrow="Dispatch engine demo"
        title="See who gets offered a job, and why"
        text="Change the service, vehicle and area, and switch drivers on or off. The drivers are made-up samples and the ordering is a simplified illustration."
      />
      <EngineDemo />
    </div>
  );
}
