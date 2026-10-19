import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, login, watchConsole } from "./helpers";

const ROLES: [string | null, string][] = [
  [null, "/"],
  ["customer@demo.callrecon.test", "/dashboard"],
  ["driver.bayside@demo.callrecon.test", "/provider"],
  ["admin@demo.callrecon.test", "/admin"],
];

async function crawl(page: Page, start: string, limit = 60) {
  const seen = new Set<string>();
  const queue = [start];
  const problems: string[] = [];
  const origin = new URL(page.url() || "http://localhost:3100").origin;
  while (queue.length && seen.size < limit) {
    const p = queue.shift()!;
    if (seen.has(p)) continue;
    seen.add(p);
    const errors = watchConsole(page);
    const res = await page.goto(p);
    const status = res?.status() ?? 0;
    if (status >= 400) problems.push(`${status} ${p}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalScroll(page).catch((e) => problems.push(String(e).split("\n")[0]));
    await page.setViewportSize({ width: 1280, height: 900 });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).disableRules(["region"]).analyze();
    for (const v of axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")) {
      problems.push(`a11y ${p}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`);
    }
    if (errors.length) problems.push(`console ${p}: ${errors[0]}`);
    page.removeAllListeners("console");
    page.removeAllListeners("pageerror");
    const links = await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
    for (const href of links) {
      const u = new URL(href);
      if (u.origin !== origin || u.pathname.startsWith("/api/") || /\.(pdf|csv)$/.test(u.pathname)) continue;
      const key = u.pathname + u.search;
      if (!seen.has(key) && !queue.includes(key)) queue.push(key);
    }
  }
  return { pages: seen.size, problems };
}

for (const [email, start] of ROLES) {
  test(`crawl as ${email ?? "visitor"}: no dead links, a11y or mobile overflow`, async ({ page }) => {
    test.setTimeout(300_000);
    if (email) await login(page, email);
    else await page.goto("/");
    const { pages, problems } = await crawl(page, start);
    console.log(`${email ?? "visitor"}: crawled ${pages} pages`);
    expect(problems).toEqual([]);
  });
}
