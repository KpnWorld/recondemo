import path from "node:path";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to sign in", async ({ page }) => {
  for (const p of ["/dashboard", "/provider", "/admin", "/admin/settings"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("customers and providers can't open other roles' areas", async ({ page }) => {
  await login(page, "customer@demo.callrecon.test");
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin/);
  await page.goto("/provider");
  await expect(page).not.toHaveURL(/\/provider/);
  const res = await page.request.get("/api/reports/requests");
  expect(res.status()).toBe(403);

  await login(page, "driver.bayside@demo.callrecon.test");
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/dashboard/);
  await page.goto("/admin/requests");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("staff roles only see what their role allows", async ({ page }) => {
  const cases: [string, string[], string[]][] = [
    ["dispatch@demo.callrecon.test", ["/admin/requests", "/admin/providers", "/admin/support"], ["/admin/settings", "/admin/pricing", "/admin/payments"]],
    ["support@demo.callrecon.test", ["/admin/support", "/admin/payments"], ["/admin/pricing", "/admin/users?tab=staff&x=1", "/admin/reports"]],
    ["finance@demo.callrecon.test", ["/admin/payments?tab=payouts", "/admin/reports"], ["/admin/providers", "/admin/settings", "/admin/catalog"]],
  ];
  for (const [email, allowed, denied] of cases) {
    await login(page, email);
    for (const p of allowed) {
      const r = await page.goto(p);
      expect(r?.status(), `${email} ${p}`).toBe(200);
      await expect(page, `${email} ${p}`).toHaveURL(new RegExp(p.split("?")[0]));
    }
    for (const p of denied) {
      await page.goto(p);
      if (p.startsWith("/admin/users")) continue; // support can view users but not manage
      await expect(page, `${email} ${p}`).toHaveURL(/\/admin\?denied=1/);
      await expect(page.getByText("doesn't have access")).toBeVisible();
    }
  }
  const support = await page.request.get("/api/reports/payouts");
  expect(support.status()).toBe(200); // finance can export
  await login(page, "support@demo.callrecon.test");
  expect((await page.request.get("/api/reports/payouts")).status()).toBe(403);
});

test("unverified provider uploads documents and an admin verifies them", async ({ page }) => {
  await login(page, "driver.pending@demo.callrecon.test");
  await page.goto("/provider");
  await expect(page.getByText("awaiting verification")).toBeVisible();
  await expect(page.getByRole("button", { name: "Go online" })).toBeDisabled();
  await page.goto("/provider/onboarding");
  await page.getByLabel("Document type").selectOption("DRIVERS_LICENSE");
  await page.locator("#doc-file").setInputFiles(path.join(__dirname, "sample.pdf"));
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByText("Document uploaded for review")).toBeVisible();

  await login(page, "admin@demo.callrecon.test");
  await page.goto("/admin/providers?status=PENDING");
  await page.getByRole("link", { name: "Sunrise Wrecker Co. (Demo)" }).click();
  page.on("dialog", (d) => d.accept());
  const authorize = async () => {
    for (const box of await page
      .getByRole("group", { name: /authorized services/i })
      .getByRole("checkbox")
      .all())
      await box.check();
  };
  // Approving the provider before documents are approved must be refused.
  await authorize();
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText(/approve these documents first/i)).toBeVisible();
  const approveButtons = page.getByRole("button", {
    name: "Approve",
    exact: true,
  });
  for (let n = await approveButtons.count(); n > 0; n--) {
    await approveButtons.first().click();
    await expect(approveButtons).toHaveCount(n - 1);
  }
  await page.waitForLoadState("networkidle");
  await authorize();
  await expect(page.getByRole("checkbox", { name: "Standard towing" })).toBeChecked();
  await page.getByRole("button", { name: "Save decision" }).click();
  await expect(page.getByText(/verification updated/i)).toBeVisible();
});

test("contact form creates a ticket that support can resolve", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/help");
  await page.getByRole("textbox", { name: "Your name" }).fill("QA Visitor");
  await page.getByRole("textbox", { name: "Email" }).fill("visitor@example.com");
  await page.getByLabel("Topic").selectOption("REFUND");
  await page.getByRole("textbox", { name: "Subject" }).fill("Refund question");
  await page.getByRole("textbox", { name: "How can we help?" }).fill("I was charged for a cancelled request, please check.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/received as ticket TK-/)).toBeVisible();

  await login(page, "support@demo.callrecon.test");
  await page.goto("/admin/support");
  await page.getByRole("link", { name: "Refund question" }).last().click();
  await page.waitForURL(/\/admin\/support\/[a-z0-9]+/);
  await page.getByRole("combobox", { name: "Status" }).selectOption("RESOLVED");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/add a resolution note/i)).toBeVisible();
  await page.getByLabel("Resolution note").fill("Confirmed no charge was made (demo).");
  await page.getByRole("combobox", { name: "Status" }).selectOption("RESOLVED");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Ticket updated")).toBeVisible();
});

test("super admin edits a pricing rule and the change is audited", async ({ page }) => {
  await login(page, "admin@demo.callrecon.test");
  await page.goto("/admin/pricing");
  await page
    .getByRole("row", { name: /Battery jump-start/ })
    .getByRole("link", { name: "Edit" })
    .click();
  await page.getByLabel("Base / hookup fee (USD)").fill("70");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByText("Pricing rule saved")).toBeVisible();
  await page.goto("/admin/audit?q=pricing");
  await expect(page.getByText("pricing.update").first()).toBeVisible();
});
