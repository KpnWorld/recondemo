import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { Flash, PageHeader } from "@/components/ui";
import { AccountSettings } from "@/components/account-settings";

export const metadata: Metadata = { title: "Account" };

export default async function AdminAccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["ADMIN"], "/admin/account");
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Account" />
      <Flash {...sp} />
      <AccountSettings actor={user} />
    </>
  );
}
