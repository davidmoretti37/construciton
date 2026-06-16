import { test } from "@playwright/test";

test("forge dashboard chat input", async ({ page }) => {
  test.setTimeout(60_000);
  page.on("console", (m) => { if (m.type() === "error") console.log("ERR:", m.text().slice(0, 200)); });
  page.on("pageerror", (e) => console.log("PAGEERR:", e.message.slice(0, 200)));

  await page.goto("http://100.97.31.74:3221/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const url = page.url();
  console.log("landed at:", url);
  await page.screenshot({ path: "/tmp/forge-dash-home.png", fullPage: true });

  // Find any link/button that opens a project
  const proj = await page.locator('a[href^="/project/"]').first();
  const has = await proj.count();
  console.log("project links found:", has);
  if (has > 0) {
    await proj.click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: "/tmp/forge-dash-project.png", fullPage: true });
    console.log("project url:", page.url());
  }
});
