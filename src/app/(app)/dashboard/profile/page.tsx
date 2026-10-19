import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { Flash, PageHeader } from "@/components/ui";
import { AccountSettings } from "@/components/account-settings";

export const metadata: Metadata = { title: "Profile & settings" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["CUSTOMER"]);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Profile & settings" />
      <Flash {...sp} />
      <AccountSettings actor={user} />
    </>
  );
}
