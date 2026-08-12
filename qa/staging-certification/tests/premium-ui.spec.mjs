import { expect, test } from "@playwright/test";

const tabs = [
  ["Summary", "summary"],
  ["Payments", "payments"],
  ["Memberships", "memberships"],
  ["Recurring customers", "recurring"],
  ["Reconciliation", "reconciliation"],
  ["Plans", "plans"],
  ["Exports", "exports"],
];

test("Premium Admin workspace exposes every operational tab and keeps state in the URL", async ({ page }) => {
  await page.goto("/en/admin/premium");
  await expect(page.getByRole("heading", { name: "Measure and operate paid membership from one authority." })).toBeVisible();

  for (const [label, id] of tabs) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]tab=${id}(?:&|$)`));
  }
});

test("Premium Admin workspace survives refresh on a deep-linked tab", async ({ page }) => {
  await page.goto("/en/admin/premium?tab=memberships&preset=last_7_days&aggregation=daily");
  await expect(page.getByRole("button", { name: "Memberships", exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/tab=memberships/);
  await expect(page.getByRole("button", { name: "Memberships", exact: true })).toBeVisible();
});
