import { expect, test } from "@playwright/test";

test.describe("deterministic collaborative campaign", () => {
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
      await expect(
        page.getByRole("dialog", { name: "Navigation" }).getByRole("link", { name: "Suppression" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Navigation" })).toBeHidden();
    }

    await page.goto("/integrations");
    await expect(page.getByText("Demo connected", { exact: true })).toBeVisible();
    await expect(page.getByText("muse-spark-1.1", { exact: true })).toBeVisible();

    await page.goto("/campaigns/new");
    await expect(
      page.getByText("Tell me about your company, what you sell, and who you’re trying to reach."),
    ).toBeVisible();
    await page
      .getByLabel("Answer Marlow")
      .fill("Northstar sells workflow analytics to operations leaders at Midwest manufacturers.");
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(page.getByText(/which roles feel the pain/i)).toBeVisible();

    await page.goto("/review");
    await expect(page).toHaveURL(/\/review\/70000000-0000-4000-8000-000000000001$/);
    await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
    await expect(page.getByText("Supporting sources")).toBeVisible();
    const body = page.getByLabel("Email body");
    await body.fill(`${await body.inputValue()}\n\nOpen to comparing notes next Tuesday?`);
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
  });
});
