import { expect, test } from "@playwright/test";

async function json(response, label) {
  if (!response.ok()) throw new Error(`${label} failed with HTTP ${response.status()}.`);
  return response.json();
}

test("learner can change and restore a privacy preference through the browser", async ({ page, request }) => {
  const original = await json(await request.get("/api/v1/account/privacy"), "Privacy lookup");
  await page.goto("/en/account");

  const marketing = page.getByLabel(/Marketing messages/);
  await expect(marketing).toBeVisible();
  const initial = await marketing.isChecked();
  expect(initial).toBe(original.marketingConsent);

  await marketing.click();
  await expect(page.getByText("Privacy preferences saved.")).toBeVisible();
  await expect(marketing).toBeChecked({ checked: !initial });

  const restored = await request.patch("/api/v1/account/privacy", {
    data: { marketingConsent: initial },
  });
  expect(restored.ok()).toBe(true);
});

test("learner can download the bounded private JSON export from the account UI", async ({ page }) => {
  await page.goto("/en/account");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Prepare private JSON export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^skillup-data-export-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText("Your export was prepared and downloaded on this device.")).toBeVisible();
});

test("account deletion can be scheduled and cancelled through the browser cooldown flow", async ({ page, request }) => {
  await request.delete("/api/v1/account/deletion").catch(() => undefined);
  await page.goto("/en/account");

  await page.getByLabel(/I understand the cooldown and retained records/).check();
  await page.getByRole("button", { name: "Schedule account deletion" }).click();
  await expect(page.getByText("Account deletion is scheduled. You can cancel it during the cooldown.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel deletion" }).click();
  await expect(page.getByText("Account deletion cancelled.")).toBeVisible();
});
