import { expect, test } from "@playwright/test";

test.describe("deterministic collaborative campaign", () => {
  test("offers a complete account creation path", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel("Work email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");

    await page.goto("/sign-in?error=invalid-credentials");
    await expect(page.getByRole("alert")).toContainText(
      "That email and password combination did not work.",
    );
    await expect(page.getByRole("link", { name: "Reset your password" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  test("moves from discovery through an exactly-once approved demo send", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in to Marlow" })).toBeVisible();
    await page.getByRole("link", { name: "Open deterministic demo" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("Awaiting approval", { exact: true })).toBeVisible();
    if ((page.viewportSize()?.width ?? 1_000) < 680) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const mobileDrawer = page.getByRole("dialog", { name: "Navigation" });
      await expect(mobileDrawer.getByRole("link", { name: "Suppression" })).toBeVisible();
      await expect(mobileDrawer.locator(".credits-mini")).toHaveCSS("display", "block");
      await expect(mobileDrawer.locator(".credits-mini")).toHaveCSS(
        "background-color",
        "rgb(26, 57, 51)",
      );
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
    }

    await page.goto("/integrations");
    const gmailCard = page.locator(".integration-card").filter({
      has: page.getByRole("heading", { name: "Gmail and Google Workspace" }),
    });
    await expect(gmailCard.getByText("Connected", { exact: true })).toBeVisible();
    await expect(gmailCard.getByText("alex@northstar.example", { exact: true })).toBeVisible();
    await expect(gmailCard.getByLabel("Email signature")).toHaveValue(
      "Alex Morgan\nFounder, Northstar",
    );
    const outlookCard = page.locator(".integration-card").filter({
      has: page.getByRole("heading", { name: "Microsoft 365 and Outlook" }),
    });
    await expect(outlookCard.getByText("Connected", { exact: true })).toBeVisible();
    await expect(outlookCard.getByText("alex@northstar.example", { exact: true })).toBeVisible();
    await expect(outlookCard.getByLabel("Email signature")).toHaveValue(
      "Alex Morgan\nFounder, Northstar",
    );
    await expect(page.getByText("muse-spark-1.1", { exact: true })).toBeVisible();

    await page.goto("/campaigns/new");
    await expect(
      page.getByText("Tell me about your company, what you sell, and who you’re trying to reach."),
    ).toBeVisible();
    const readinessIndicator = page.locator(
      '[role="progressbar"][aria-label="Campaign readiness"]',
    );
    const readinessLabel = page.locator(".readiness-copy strong");
    await expect(readinessIndicator).toHaveAttribute("aria-valuenow", "18");
    await expect(readinessIndicator).toContainText("18%");
    await expect(readinessLabel).toHaveText("18% ready");
    if ((page.viewportSize()?.width ?? 1_000) >= 680) {
      await expect(readinessIndicator).toBeVisible();
      await expect(readinessLabel).toBeVisible();
    }
    await page
      .getByLabel("Answer Marlow")
      .fill("Northstar sells workflow analytics to operations leaders at Midwest manufacturers.");
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(page.getByText(/which roles feel the pain/i)).toBeVisible();
    await expect(readinessIndicator).toHaveAttribute("aria-valuenow", "36");
    await expect(readinessIndicator).toContainText("36%");
    await expect(readinessLabel).toHaveText("36% ready");

    await page.goto("/campaigns");
    const followUpCampaign = page.locator(".campaign-card--follow-up").first();
    await expect(followUpCampaign).toBeVisible();
    await expect(followUpCampaign).toHaveCSS("border-color", "rgb(216, 154, 58)");
    await expect(followUpCampaign.getByText("Follow-up needed", { exact: true })).toBeVisible();
    await followUpCampaign.getByRole("link", { name: "Review follow-up" }).click();
    await expect(page).toHaveURL(/\/review\/70000000-0000-4000-8000-000000000001$/);
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
    await expect(page.getByText("No reply was detected after 7 days.")).toBeVisible();
    if ((page.viewportSize()?.width ?? 1_000) >= 900) {
      const desktopSidebar = page.locator(".sidebar");
      const activeReviewLink = desktopSidebar.locator('.nav-link--active[href="/review"]');
      await expect(activeReviewLink).toHaveCSS("background-color", "rgb(26, 57, 51)");
      await expect(activeReviewLink).toHaveCSS("border-left-color", "rgb(36, 184, 138)");
      await expect(desktopSidebar.locator(".credits-mini")).toHaveCSS("display", "block");
      await expect(desktopSidebar.locator(".credits-mini")).toHaveCSS(
        "background-color",
        "rgb(26, 57, 51)",
      );
    }
    await expect(page.getByText("Supporting sources")).toBeVisible();
    const body = page.getByLabel("Email body");
    await body.fill(`${await body.inputValue()}\n\nTuesday mornings also work for me.`);
    await page.getByRole("button", { name: /Approve and send/ }).click();
    await expect(page.getByText(/Demo send confirmed/i)).toBeVisible();

    const key = "e2e-stable-idempotency-key-0001";
    const options = {
      headers: {
        Origin: "http://localhost:41783",
        "Sec-Fetch-Site": "same-origin",
        "Idempotency-Key": key,
      },
      data: { mailboxId: "demo-mailbox" },
    };
    const first = await request.post(
      "/api/drafts/70000000-0000-4000-8000-000000000001/approve-and-send",
      options,
    );
    const second = await request.post(
      "/api/drafts/70000000-0000-4000-8000-000000000001/approve-and-send",
      options,
    );
    expect(first.ok()).toBe(true);
    expect(second.ok()).toBe(true);
    const firstBody = (await first.json()) as { data: { externalMessageId: string } };
    const secondBody = (await second.json()) as {
      data: { externalMessageId: string; duplicate: boolean };
    };
    expect(secondBody.data.externalMessageId).toBe(firstBody.data.externalMessageId);
    expect(secondBody.data.duplicate).toBe(true);
  });

  test("applies security headers and blocks cross-site mutations", async ({ request }) => {
    const pageResponse = await request.get("/");
    expect(pageResponse.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(pageResponse.headers()["x-frame-options"]).toBe("DENY");
    const response = await request.post("/api/campaigns", {
      headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
      data: { name: "Cross-site campaign", objective: "Should fail" },
    });
    expect(response.status()).toBe(403);
    const unauthorizedCron = await request.get("/api/cron/follow-ups");
    expect(unauthorizedCron.status()).toBe(401);
    const authorizedCron = await request.get("/api/cron/follow-ups", {
      headers: { Authorization: "Bearer e2e-follow-up-secret-0001" },
    });
    expect(authorizedCron.ok()).toBe(true);
    expect(await authorizedCron.json()).toEqual({
      data: { checked: 0, replied: 0, draftsCreated: 0, errors: 0 },
    });
  });
});
