import { expect, test } from "@playwright/test";

const openApiDocument = JSON.stringify(
  {
    openapi: "3.0.3",
    info: { title: "Status API", version: "1.0.0" },
    paths: {
      "/": {
        get: {
          summary: "Get status",
          responses: { "200": { description: "Healthy" } },
        },
      },
    },
  },
  null,
  2,
);

test("developer can complete the first-value workspace flow", async ({ page }) => {
  const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3101/v1";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${suffix}@example.invalid`;
  const password = `safe-e2e-password-${suffix}`;
  const organizationName = `E2E Organization ${suffix}`;
  const projectName = `Status API ${suffix}`;

  await page.goto("/workspace");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Name").fill("E2E Developer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "Import and review your API contracts." })).toBeVisible();

  const revokedToken = await page.evaluate(() =>
    localStorage.getItem("api-sentinel-token"),
  );
  expect(revokedToken).not.toBeNull();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  const revokedSession = await page.request.get(`${apiUrl}/auth/me`, {
    headers: { authorization: `Bearer ${revokedToken}` },
  });
  expect(revokedSession.status()).toBe(401);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByText(email)).toBeVisible();

  const organizationPanel = page.getByRole("heading", { name: "Organization" }).locator("..");
  await organizationPanel.getByLabel("New organization").fill(organizationName);
  await organizationPanel.getByRole("button", { name: "Create" }).click();
  await expect(organizationPanel.getByRole("combobox")).toContainText(organizationName);

  const projectPanel = page.getByRole("heading", { name: "Project" }).locator("..");
  await projectPanel.getByLabel("New project").fill(projectName);
  await projectPanel.getByRole("button", { name: "Create" }).click();
  await expect(projectPanel.getByRole("combobox")).toContainText(projectName);

  const environmentPanel = page.getByRole("heading", { name: "Configure a base URL" }).locator("..");
  await environmentPanel.getByLabel("Environment name").first().fill("Staging");
  await environmentPanel.getByLabel("Base URL").first().fill("https://staging.example.com");
  await environmentPanel.getByRole("button", { name: "Create environment" }).click();
  await expect(environmentPanel.locator(".environment-row strong")).toHaveText("Staging");
  await environmentPanel.getByRole("button", { name: "Edit" }).click();
  await environmentPanel.getByLabel("Environment name").last().fill("Production");
  await environmentPanel.getByLabel("Base URL").last().fill("https://api.example.com");
  await environmentPanel.getByRole("button", { name: "Save changes" }).click();
  await expect(environmentPanel.locator(".environment-row strong")).toHaveText("Production");

  const specificationPanel = page.getByRole("heading", { name: "Import OpenAPI 3.x" }).locator("..");
  await specificationPanel.getByLabel("Specification name").fill("Status API");
  await specificationPanel.getByLabel("OpenAPI JSON").fill(openApiDocument);
  await specificationPanel.getByRole("button", { name: "Import specification" }).click();
  await expect(page.getByText("Specification imported successfully.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Specifications" }).locator("..").getByText("Status API", { exact: true })).toBeVisible();

  const collectionPanel = page.getByRole("heading", { name: "Run an API check" }).locator("..");
  await collectionPanel.getByLabel("Collection name").fill("Public smoke test");
  await collectionPanel
    .getByLabel("Environment")
    .selectOption({ label: "Production — https://api.example.com" });
  await collectionPanel.getByRole("button", { name: "Create collection" }).click();
  await expect(
    collectionPanel.getByLabel("Collection", { exact: true }),
  ).toContainText("Public smoke test");
  await collectionPanel.getByLabel("Request name").fill("Example domain health");
  await collectionPanel.getByLabel("Public HTTPS URL").fill("https://example.com/");
  await collectionPanel.getByRole("button", { name: "Add request" }).click();
  await collectionPanel.getByRole("button", { name: "Run collection" }).click();
  await expect(
    collectionPanel.getByText("PASSED", { exact: true }).first(),
  ).toBeVisible({ timeout: 45_000 });
});
