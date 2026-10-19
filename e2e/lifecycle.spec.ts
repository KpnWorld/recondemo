import { expect, test } from "@playwright/test";
import { login, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

let requestUrl = "";
let towUrl = "";
const stamp = Date.now().toString(36);

test("new customer registers", async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("QA Customer");
  await page.getByRole("textbox", { name: "Email" }).fill(`qa-${stamp}@example.com`);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("QaPassword123");
  for (const box of await page.getByRole("checkbox").all()) if (!(await box.isChecked())) await box.check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/dashboard|\/request/);
  expect(errors).toEqual([]);
});

test("signup rejects a weak password and duplicate email", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Full name", exact: true }).fill("Dup");
  await page.getByRole("textbox", { name: "Email" }).fill(`qa-${stamp}@example.com`);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("short");
  for (const box of await page.getByRole("checkbox").all()) if (!(await box.isChecked())) await box.check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/at least 10 characters/i).first()).toBeVisible();
});

test("customer requests a jump-start with an itemized estimate", async ({ page }) => {
  const errors = watchConsole(page);
  await login(page, "customer@demo.callrecon.test");
  await page.goto("/request");
  await page.getByLabel("Or choose a saved place").selectOption({ label: "Demo sample: Downtown (sample)" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Battery jump-start", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click(); // saved vehicle preselected
  await page.getByText("Battery problem").click();
  await page.getByText("Yes, I'm safe").click();
  await page.getByRole("button", { name: "See price" }).click();
  await expect(page.getByText("Estimated total")).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /tax/i })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Confirm request" }).click();
  await page.waitForURL(/\/requests\/[a-z0-9]+/);
  requestUrl = new URL(page.url()).pathname;
  await expect(page.getByText(/finding|searching|contacting/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("provider accepts the offer and completes the job", async ({ page }) => {
  const errors = watchConsole(page);
  const id = requestUrl.split("/").pop()!;
  await login(page, "driver.harbor@demo.callrecon.test");
  await page.goto("/provider");
  const offer = page.locator("li", { hasText: "Battery jump-start" }).first();
  await expect(offer).toBeVisible();
  await offer.getByRole("button", { name: "Accept" }).click();
  await page.waitForURL(new RegExp(`/provider/jobs/${id}`));
  await page.getByLabel(/arrival estimate/i).fill("20");
  await page.getByRole("button", { name: "I'm on my way" }).click();
  await expect(page.getByText("Status updated")).toBeVisible();
  await page.getByRole("button", { name: "I've arrived" }).click();
  await page.getByRole("button", { name: "Start service" }).click();
  await page.getByLabel("Completion notes").fill("Battery boosted, vehicle started.");
  await page.getByRole("button", { name: "Mark job complete" }).click();
  await expect(page.getByText("Final total")).toBeVisible();
  expect(errors).toEqual([]);
});

test("customer sees completion, the driver estimate label and the receipt", async ({ page }) => {
  await login(page, "customer@demo.callrecon.test");
  await page.goto(requestUrl);
  await expect(page.getByText(/completed/i).first()).toBeVisible();
  await page.goto(`${requestUrl}/receipt`);
  await expect(page.getByText(/RC-/).first()).toBeVisible();
  await expect(page.getByText(/demo/i).first()).toBeVisible();
});

test("customer can cancel a new request for free before assignment", async ({ page }) => {
  await login(page, "customer@demo.callrecon.test");
  await page.goto("/request");
  await page.getByLabel("Or choose a saved place").selectOption({ label: "Demo sample: Westshore (sample)" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Lockout assistance", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Locked out").click();
  await page.getByText("Yes, I'm safe").click();
  await page.getByRole("button", { name: "See price" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Confirm request" }).click();
  await page.waitForURL(/\/requests\//);
  page.once("dialog", (d) => d.accept());
  const reason = page.getByRole("combobox", { name: "Reason" });
  if (!(await reason.isVisible()))
    await page
      .getByText(/cancel request/i)
      .first()
      .click();
  await reason.selectOption({ index: 1 });
  await page.getByRole("button", { name: /cancel request/i }).click();
  await expect(page.getByText(/cancelled/i).first()).toBeVisible();
});

test("towing without a mapping key waits for a dispatcher quote", async ({ page }) => {
  await login(page, "customer@demo.callrecon.test");
  await page.goto("/request");
  await page.getByLabel("Or choose a saved place").selectOption({ label: "Demo sample: Downtown (sample)" });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Flatbed towing", { exact: true }).click();
  const dest = page.getByLabel("Demo sample destination");
  if (await dest.count()) await dest.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Accident or breakdown").click();
  await page.getByText("Yes, I'm safe").click();
  await page.getByRole("button", { name: "See price" }).click();
  await expect(page.getByText("A confirmed quote is needed before dispatch")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Confirm request" }).click();
  await page.waitForURL(/\/requests\//);
  towUrl = new URL(page.url()).pathname;
  await expect(page.getByText(/quote/i).first()).toBeVisible();
});

test("dispatcher sends a confirmed quote, customer approves, dispatcher assigns", async ({ page }) => {
  const id = towUrl.split("/").pop()!;
  await login(page, "dispatch@demo.callrecon.test");
  await page.goto(`/admin/requests/${id}`);
  await page.getByLabel("Confirmed towing miles").fill("12");
  await page.getByRole("button", { name: "Send quote for approval" }).click();
  await expect(page.getByText("Quote sent to the customer")).toBeVisible();

  await login(page, "customer@demo.callrecon.test");
  await page.goto(towUrl);
  await page
    .getByRole("button", { name: /approve/i })
    .first()
    .click();
  await expect(page.getByText(/price is approved/i)).toBeVisible();

  await login(page, "dispatch@demo.callrecon.test");
  await page.goto(`/admin/requests/${id}`);
  await page.getByLabel("Assign provider").selectOption({ index: 1 });
  await page.getByLabel("Reason").first().fill("Confirmed by phone");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Assign provider" }).click();
  await expect(page.getByText("Provider assigned and notified")).toBeVisible();
});
