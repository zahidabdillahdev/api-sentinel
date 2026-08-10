import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

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

  await collectionPanel.getByLabel("Request name").fill("Intentional failure");
  await collectionPanel.getByLabel("Public HTTPS URL").fill("https://example.com/");
  await collectionPanel.getByLabel("Expected status").fill("418");
  await collectionPanel.getByRole("button", { name: "Add request" }).click();
  await collectionPanel.getByRole("button", { name: "Run collection" }).click();
  await expect(
    collectionPanel.getByText("FAILED", { exact: true }).first(),
  ).toBeVisible({ timeout: 45_000 });
  await expect(
    collectionPanel.getByText(/Expected status 418, received 200/).first(),
  ).toBeVisible();
});

test("viewer access and organization run quota are enforced", async ({
  request,
}) => {
  const apiUrl = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:3101/v1";
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = `safe-e2e-password-${suffix}`;

  async function register(email: string, name: string) {
    const response = await request.post(`${apiUrl}/auth/register`, {
      data: { email, name, password },
    });
    expect(response.status()).toBe(201);
    return (await response.json()) as { token: string };
  }

  const owner = await register(`owner-${suffix}@example.invalid`, "E2E Owner");
  const viewer = await register(`viewer-${suffix}@example.invalid`, "E2E Viewer");
  const ownerHeaders = { authorization: `Bearer ${owner.token}` };
  const viewerHeaders = { authorization: `Bearer ${viewer.token}` };

  const organizationResponse = await request.post(`${apiUrl}/organizations`, {
    headers: ownerHeaders,
    data: { name: `Quota Organization ${suffix}` },
  });
  expect(organizationResponse.status()).toBe(201);
  const organization = (await organizationResponse.json()) as { id: string };

  const projectResponse = await request.post(
    `${apiUrl}/organizations/${organization.id}/projects`,
    {
      headers: ownerHeaders,
      data: { name: `Quota API ${suffix}` },
    },
  );
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()) as { id: string };

  const invitationResponse = await request.post(
    `${apiUrl}/organizations/${organization.id}/invitations`,
    {
      headers: ownerHeaders,
      data: { email: `viewer-${suffix}@example.invalid`, role: "VIEWER" },
    },
  );
  expect(invitationResponse.status()).toBe(201);
  const invitation = (await invitationResponse.json()) as { token: string };
  const acceptanceResponse = await request.post(
    `${apiUrl}/invitations/${invitation.token}/accept`,
    { headers: viewerHeaders, data: {} },
  );
  expect(acceptanceResponse.status()).toBe(200);

  const collectionResponse = await request.post(
    `${apiUrl}/projects/${project.id}/collections`,
    {
      headers: ownerHeaders,
      data: { name: "Quota checks" },
    },
  );
  expect(collectionResponse.status()).toBe(201);
  const collection = (await collectionResponse.json()) as { id: string };

  const requestResponse = await request.post(
    `${apiUrl}/collections/${collection.id}/requests`,
    {
      headers: ownerHeaders,
      data: {
        name: "Example health",
        method: "GET",
        url: "https://example.com/",
        expectedStatus: 200,
      },
    },
  );
  expect(requestResponse.status()).toBe(201);

  const viewerRead = await request.get(
    `${apiUrl}/projects/${project.id}/collections`,
    { headers: viewerHeaders },
  );
  expect(viewerRead.status()).toBe(200);

  const viewerWrite = await request.post(
    `${apiUrl}/projects/${project.id}/collections`,
    {
      headers: viewerHeaders,
      data: { name: "Unauthorized collection" },
    },
  );
  expect(viewerWrite.status()).toBe(403);
  expect((await viewerWrite.json()).error.code).toBe("FORBIDDEN");

  const viewerRun = await request.post(
    `${apiUrl}/collections/${collection.id}/runs`,
    { headers: viewerHeaders, data: {} },
  );
  expect(viewerRun.status()).toBe(403);
  expect((await viewerRun.json()).error.code).toBe("FORBIDDEN");

  const activeRun = await prisma.executionRun.create({
    data: { collectionId: collection.id, status: "QUEUED" },
  });
  const viewerRunRead = await request.get(`${apiUrl}/runs/${activeRun.id}`, {
    headers: viewerHeaders,
  });
  expect(viewerRunRead.status()).toBe(200);

  const quotaResponse = await request.post(
    `${apiUrl}/collections/${collection.id}/runs`,
    { headers: ownerHeaders, data: {} },
  );
  expect(quotaResponse.status()).toBe(429);
  const quotaBody = await quotaResponse.json();
  expect(quotaBody.error).toMatchObject({
    code: "ACTIVE_RUN_QUOTA_EXCEEDED",
    details: { limit: 1, scope: "organization" },
  });
});
