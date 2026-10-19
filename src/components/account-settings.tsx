import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { smsConfigured } from "@/lib/integrations/messaging";
import { deleteAccountAction, passwordAction, phoneVerifyAction, profileAction } from "@/app/actions/customer";
import { Alert, Badge, Card, Checkbox, Field, Input } from "./ui";
import { ConfirmSubmit, SubmitButton } from "./client";

export async function AccountSettings({ actor }: { actor: Actor }) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.id },
    include: { customerProfile: true },
  });
  const sms = smsConfigured();
  return (
    <div className="space-y-5">
      <Card>
        <h2 className="mb-4 text-lg font-semibold">Contact details</h2>
        <form action={profileAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="name" required>
              <Input id="name" name="name" defaultValue={user.name} autoComplete="name" required />
            </Field>
            <Field label="Email" htmlFor="email" required hint="Contact support to change your email.">
              <Input id="email" defaultValue={user.email} disabled />
            </Field>
            <Field
              label="Mobile phone"
              htmlFor="phone"
              hint={
                <>
                  {user.phone ? user.phoneVerified ? <Badge tone="ok">Verified</Badge> : <Badge tone="gold">Not verified</Badge> : null} Shared with your provider only through Call
                  Recon messaging.
                </>
              }
            >
              <Input id="phone" name="phone" type="tel" defaultValue={user.phone ?? ""} autoComplete="tel" />
            </Field>
            {actor.role === "CUSTOMER" ? (
              <>
                <Field label="Emergency contact name" htmlFor="ecn">
                  <Input id="ecn" name="emergencyContactName" defaultValue={user.customerProfile?.emergencyContactName ?? ""} />
                </Field>
                <Field label="Emergency contact phone" htmlFor="ecp">
                  <Input id="ecp" name="emergencyContactPhone" type="tel" defaultValue={user.customerProfile?.emergencyContactPhone ?? ""} />
                </Field>
              </>
            ) : null}
          </div>
          <fieldset className="rounded-2xl bg-soft p-4">
            <legend className="sr-only">Notification preferences</legend>
            <p className="text-sm font-semibold text-deep">Notifications</p>
            <p className="text-sm text-ink-muted">In-app notifications are always on. You can change these anytime.</p>
            <Checkbox name="emailNotifications" defaultChecked={user.emailNotifications} label="Email" />
            <Checkbox
              name="smsNotifications"
              defaultChecked={user.smsNotifications}
              label="Text message"
              description={sms ? "Message and data rates may apply." : "Available once an SMS provider is connected."}
            />
            <Checkbox name="pushNotifications" defaultChecked={user.pushNotifications} label="Push notifications" description="For the upcoming mobile apps." />
          </fieldset>
          <p className="text-sm text-ink-muted">
            Location permission:{" "}
            {user.locationConsentAt
              ? `granted ${user.locationConsentAt.toLocaleDateString()} (shared only with your assigned provider).`
              : "not granted yet. We'll ask when you request service."}
          </p>
          <SubmitButton>Save</SubmitButton>
        </form>
      </Card>

      {user.phone && !user.phoneVerified ? (
        <Card>
          <h2 className="text-lg font-semibold">Verify your phone</h2>
          {sms ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <form action={phoneVerifyAction}>
                <SubmitButton variant="secondary" name="op" value="send">
                  Text me a code
                </SubmitButton>
              </form>
              <form action={phoneVerifyAction} className="flex items-end gap-2">
                <Field label="6-digit code" htmlFor="code" required>
                  <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-36" required />
                </Field>
                <SubmitButton name="op" value="verify">
                  Verify
                </SubmitButton>
              </form>
            </div>
          ) : (
            <Alert tone="info" className="mt-3">
              Phone verification will be available once an SMS provider is connected.
            </Alert>
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Change password</h2>
        <form action={passwordAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" htmlFor="current" required>
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="next" required hint="At least 10 characters, with a letter and a number.">
            <Input id="next" name="next" type="password" autoComplete="new-password" required />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton variant="secondary">Update password</SubmitButton>
          </div>
        </form>
      </Card>

      {actor.role !== "ADMIN" ? (
        <Card>
          <h2 className="text-lg font-semibold">Delete account</h2>
          <p className="mt-1 text-sm text-ink-muted">
            We&apos;ll remove your personal details, saved vehicles and places. Records of past services and payments are kept without your name where the law requires.
          </p>
          <form action={deleteAccountAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Confirm with your password" htmlFor="del-pw" required>
              <Input id="del-pw" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <ConfirmSubmit variant="danger" message="Permanently delete your account? This can't be undone.">
              Delete my account
            </ConfirmSubmit>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
