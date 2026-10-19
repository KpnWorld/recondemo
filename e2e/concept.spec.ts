import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, watchConsole } from "./helpers";

const PAGES = ["/launch", "/demo", "/demo/customer", "/demo/driver", "/demo/admin", "/demo/engine"];

test.describe("launch page and demos", () => {
  for (const path of PAGES) {
    test(`${path} renders, is labeled as a concept, fits phones and passes axe`, async ({ page }) => {
      const errors = watchConsole(page);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByText(/Concept preview\. Call Recon is still being built/)).toBeVisible();
      await expect(page.getByText(/not an emergency service/i).first()).toBeVisible();
      await page.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalScroll(page);
      await page.setViewportSize({ width: 1280, height: 900 });
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["region"]).analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }

  test("customer demo walks through every step without showing invented prices", async ({ page }) => {
    await page.goto("/demo/customer");
    await page.getByRole("button", { name: /Use sample location/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel(/^Make/).fill("Sample");
    await page.getByLabel(/^Model/).fill("Car");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Towing" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: /Your estimate/ })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\$\s?\d/);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /Start the simulated dispatch/ }).click();
    await expect(page.getByText(/Sample Driver B accepted/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Provider Assigned").first()).toBeVisible();
    await page.getByRole("button", { name: /Advance status/ }).click();
    await expect(page.getByText("Driver En Route").first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\b\d+\s?min\b/);
  });

  test("driver demo gates offers behind going online", async ({ page }) => {
    await page.goto("/demo/driver");
    await expect(page.getByRole("button", { name: "Show a sample offer" })).toHaveCount(0);
    await page.getByRole("button", { name: "Go online" }).click();
    await page.getByRole("button", { name: "Show a sample offer" }).click();
    await page.getByRole("button", { name: "Accept job" }).click();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Move to next step" }).click();
    await expect(page.getByRole("button", { name: "Move to next step" })).toBeDisabled();
  });

  test("engine demo applies eligibility rules", async ({ page }) => {
    await page.goto("/demo/engine");
    await expect(page.getByText("Offered first")).toBeVisible();
    await page.getByLabel("Vehicle").selectOption("heavy");
    await expect(page.getByText("Equipment cannot carry this vehicle").first()).toBeVisible();
    await page.getByLabel("Where the job is").selectOption("2");
    await expect(page.getByText("Sample Driver D").first()).toBeVisible();
    await page.getByRole("switch", { name: "Sample Driver D online" }).click();
    await expect(page.getByText(/No eligible driver/)).toBeVisible();
  });

  test("admin demo assigns and approves locally", async ({ page }) => {
    await page.goto("/demo/admin");
    await page.getByRole("button", { name: "Assign manually" }).click();
    await expect(page.getByText(/dispatcher assigned Sample Driver A manually/)).toBeVisible();
    await page.getByRole("button", { name: "Approve provider" }).first().click();
    await expect(page.getByText("Approved")).toBeVisible();
  });
});
