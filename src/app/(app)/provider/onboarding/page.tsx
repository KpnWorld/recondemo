import type { Metadata } from "next";
import { requirePageUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { DOCUMENT_TYPES, REQUIRED_DOCUMENT_TYPES, TRUCK_TYPES } from "@/lib/constants";
import { documentAction, onboardingAction } from "@/app/actions/provider";
import { Alert, Badge, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Table, Td } from "@/components/ui";
import { LocalTime, SubmitButton } from "@/components/client";
import { BaseLocator } from "@/components/base-locator";

export const metadata: Metadata = { title: "Business & documents" };

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

const DOC_TONE = {
  PENDING: "gold",
  APPROVED: "ok",
  REJECTED: "danger",
} as const;

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requirePageUser(["PROVIDER"], "/provider/onboarding");
  const sp = await searchParams;
  const [p, categories] = await Promise.all([
    db.providerProfile.findUniqueOrThrow({
      where: { userId: user.id },
      include: {
        services: true,
        documents: { orderBy: { createdAt: "desc" } },
      },
    }),
    db.serviceCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const hours = JSON.parse(p.operatingHours || "{}") as Record<string, [string, string]>;
  const always = Object.keys(hours).length === 0;
  const offered = new Map(p.services.map((s) => [s.serviceCategoryId, s.authorized]));
  const approvedTypes = new Set(p.documents.filter((d) => d.status === "APPROVED").map((d) => d.type));
  const missing = REQUIRED_DOCUMENT_TYPES.filter((t) => !approvedTypes.has(t) && !p.documents.some((d) => d.type === t && d.status === "PENDING"));
  const label = (t: string) => DOCUMENT_TYPES.find((d) => d.value === t)?.label ?? t;

  return (
    <>
      <PageHeader
        title="Business & documents"
        description="Tell us about your business, equipment and coverage. An administrator verifies everything before you can receive jobs."
      />
      <Flash {...sp} />
      {p.verificationStatus === "APPROVED" ? (
        <Alert tone="success" className="mb-5" title="Verified provider">
          Changing your truck type or plate sends your profile back for review. Newly added services need approval before you receive those jobs.
        </Alert>
      ) : null}

      <form action={onboardingAction} className="space-y-5">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Business</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name" htmlFor="businessName" required>
              <Input id="businessName" name="businessName" defaultValue={p.businessName} required autoComplete="organization" />
            </Field>
            <Field label="Business phone" htmlFor="businessPhone" hint="For Call Recon dispatch only. Not shown to customers.">
              <Input id="businessPhone" name="businessPhone" type="tel" defaultValue={p.businessPhone ?? ""} autoComplete="tel" />
            </Field>
            <Field label="License or permit number" htmlFor="licenseNumber" className="sm:col-span-2">
              <Input id="licenseNumber" name="licenseNumber" defaultValue={p.licenseNumber ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Truck & equipment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Truck type" htmlFor="truckType" required>
              <Select id="truckType" name="truckType" defaultValue={p.truckType ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {TRUCK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year" htmlFor="truckYear" required>
              <Input id="truckYear" name="truckYear" type="number" inputMode="numeric" min={1980} max={new Date().getFullYear() + 1} defaultValue={p.truckYear ?? ""} required />
            </Field>
            <Field label="Make" htmlFor="truckMake" required>
              <Input id="truckMake" name="truckMake" defaultValue={p.truckMake ?? ""} required />
            </Field>
            <Field label="Model" htmlFor="truckModel" required>
              <Input id="truckModel" name="truckModel" defaultValue={p.truckModel ?? ""} required />
            </Field>
            <Field label="Plate" htmlFor="truckPlate" required>
              <Input id="truckPlate" name="truckPlate" defaultValue={p.truckPlate ?? ""} required autoCapitalize="characters" />
            </Field>
            <Field label="Color" htmlFor="truckColor" hint="Helps customers recognize you.">
              <Input id="truckColor" name="truckColor" defaultValue={p.truckColor ?? ""} />
            </Field>
          </div>
          <Checkbox name="canWinch" value="true" defaultChecked={p.canWinch} label="My truck has a working winch" className="mt-2" />
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Services you offer</h2>
          <p className="mb-3 text-sm text-ink-muted">Services marked “Awaiting approval” become available once an administrator authorizes them.</p>
          <fieldset>
            <legend className="sr-only">Services</legend>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {categories.map((c) => (
                <Checkbox
                  key={c.id}
                  name="services"
                  value={c.id}
                  defaultChecked={offered.has(c.id)}
                  label={
                    <>
                      {c.name} {offered.has(c.id) ? <Badge tone={offered.get(c.id) ? "ok" : "gold"}>{offered.get(c.id) ? "Approved" : "Awaiting approval"}</Badge> : null}
                    </>
                  }
                  description={c.description}
                />
              ))}
            </div>
          </fieldset>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Coverage</h2>
          <p className="mb-4 text-sm text-ink-muted">Add the ZIP codes you serve, a base location with a radius, or both.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ZIP codes you serve" htmlFor="serviceZips" hint="Five-digit ZIPs separated by commas." className="sm:col-span-2">
              <Input id="serviceZips" name="serviceZips" defaultValue={p.serviceZips.split(",").filter(Boolean).join(", ")} inputMode="numeric" />
            </Field>
            <Field label="Base address" htmlFor="baseAddress" hint="Used to find coordinates when a mapping service is configured." className="sm:col-span-2">
              <Input id="baseAddress" name="baseAddress" defaultValue={p.baseAddress ?? ""} autoComplete="street-address" />
            </Field>
            <Field label="Base latitude" htmlFor="baseLat">
              <Input id="baseLat" name="baseLat" type="number" step="any" min={-90} max={90} defaultValue={p.baseLat ?? ""} />
            </Field>
            <Field label="Base longitude" htmlFor="baseLng">
              <Input id="baseLng" name="baseLng" type="number" step="any" min={-180} max={180} defaultValue={p.baseLng ?? ""} />
            </Field>
            <div className="sm:col-span-2">
              <BaseLocator latId="baseLat" lngId="baseLng" />
            </div>
            <Field label="Service radius (miles)" htmlFor="serviceRadiusMiles">
              <Input id="serviceRadiusMiles" name="serviceRadiusMiles" type="number" min={1} max={200} defaultValue={p.serviceRadiusMiles ?? ""} />
            </Field>
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Operating hours</h2>
          <p className="mb-3 text-sm text-ink-muted">Times are Eastern. You also control availability with the online switch on your dashboard.</p>
          <Checkbox name="always" value="true" defaultChecked={always} label="Available any time I'm online" description="If checked, the days below are ignored." />
          <div className="mt-2 divide-y divide-line">
            {DAYS.map(([d, name]) => (
              <div key={d} className="grid grid-cols-2 items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[10rem_9rem_9rem]">
                <Checkbox name={`${d}_on`} value="true" defaultChecked={Boolean(hours[d])} label={name} className="col-span-2 min-h-10 py-0 sm:col-span-1" />
                <label className="sr-only" htmlFor={`${d}_open`}>
                  {name} opening time
                </label>
                <Input id={`${d}_open`} name={`${d}_open`} type="time" defaultValue={hours[d]?.[0] ?? "08:00"} />
                <label className="sr-only" htmlFor={`${d}_close`}>
                  {name} closing time
                </label>
                <Input id={`${d}_close`} name={`${d}_close`} type="time" defaultValue={hours[d]?.[1] ?? "18:00"} />
              </div>
            ))}
          </div>
        </Card>
        <SubmitButton size="lg" className="w-full sm:w-auto">
          Save business details
        </SubmitButton>
      </form>

      <Card className="mt-8 scroll-mt-24" id="documents">
        <h2 className="mb-1 text-lg font-semibold">Verification documents</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Required: {REQUIRED_DOCUMENT_TYPES.map(label).join(", ")}. Files are stored privately and are only visible to you and Call Recon administrators.
        </p>
        {missing.length ? (
          <Alert tone="warning" className="mb-4">
            Still needed: {missing.map(label).join(", ")}.
          </Alert>
        ) : null}
        {p.documents.length ? (
          <Table head={["Document", "Uploaded", "Expires", "Status", ""]} caption="Your documents">
            {p.documents.map((d) => (
              <tr key={d.id}>
                <Td>{label(d.type)}</Td>
                <Td>
                  <LocalTime iso={d.createdAt.toISOString()} mode="date" />
                </Td>
                <Td>{d.expiresOn ? <LocalTime iso={d.expiresOn.toISOString()} mode="date" /> : "—"}</Td>
                <Td>
                  <Badge tone={DOC_TONE[d.status as keyof typeof DOC_TONE] ?? "neutral"}>{d.status.charAt(0) + d.status.slice(1).toLowerCase()}</Badge>
                  {d.reviewNotes ? <span className="mt-1 block text-xs text-ink-muted">{d.reviewNotes}</span> : null}
                </Td>
                <Td>
                  <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer">
                    View
                  </a>
                </Td>
              </tr>
            ))}
          </Table>
        ) : null}
        <form action={documentAction} className="mt-5 grid gap-4 rounded-2xl bg-soft p-4 sm:grid-cols-2">
          <Field label="Document type" htmlFor="doc-type" required>
            <Select id="doc-type" name="type" required defaultValue={missing[0] ?? ""}>
              <option value="" disabled>
                Choose…
              </option>
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expiration date" htmlFor="doc-exp">
            <Input id="doc-exp" name="expiresOn" type="date" />
          </Field>
          <Field label="File" htmlFor="doc-file" required hint="JPG, PNG, WebP or PDF, up to 10 MB." className="sm:col-span-2">
            <Input id="doc-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required className="py-2.5" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton variant="secondary" pendingText="Uploading">
              Upload document
            </SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
