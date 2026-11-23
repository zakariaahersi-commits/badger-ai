import { expect, test } from "@playwright/test";

async function unlockLocalOnboarding(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "Save your place before we begin." })).toBeVisible();
  await page.getByRole("button", { name: "Continue in local test" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("badger-e2e-auth-bypass", "1"));
});

test("mobile landing explains Bo without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your AI co-founder, right in your messages.",
  );
  await expect(page.getByRole("link", { name: "Start with Bo" }).first()).toBeVisible();
  await expect(page.getByLabel("Maya's iMessage conversation with Bo")).toBeVisible();
  await expect(page.locator(".message-hero-card")).toContainText("You said you'd launch the waitlist today");
  await expect(page.locator(".message-hero-card")).toContainText("I'll check back at 10:30");
  await expect(page.locator(".bo-demo")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "One payment. Nothing renews." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start with Bo" })).toHaveCount(4);

  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.viewport + 1);

  await page.getByRole("button", { name: "Show feedback 2 of 5" }).click();
  await expect(page.getByText(/Bo is actually following up with you, rather than just giving you a task and disappearing/)).toBeVisible();
});

test("the installable PWA assets remain available after removing the landing-page distraction", async ({ request }) => {
  const [manifestResponse, workerResponse, icon192Response, icon512Response] = await Promise.all([
    request.get("/manifest.json"),
    request.get("/sw.js"),
    request.get("/icon-192.png"),
    request.get("/icon-512.png"),
  ]);
  expect(manifestResponse.ok()).toBe(true);
  expect(workerResponse.ok()).toBe(true);
  expect(icon192Response.ok()).toBe(true);
  expect(icon512Response.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    start_url: "/app",
    display: "standalone",
    icons: expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
    ]),
  });
});

test("onboarding captures an account before the long diagnostic", async ({ page }) => {
  await page.goto("/start");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Your plan and Day 1 appear before the one-time payment.")).toBeVisible();
  await expect(page.getByText(/Creating an account does not opt you into reminder emails/)).toBeVisible();
  await unlockLocalOnboarding(page);
  await expect(page.getByRole("heading", { name: "Where are you right now?" })).toBeVisible();
  await expect(page.getByRole("button", { name: /I have an idea—or too many—and feel stuck/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Meet Bo" })).toHaveCount(0);

  await page.getByRole("button", { name: /I have an idea—or too many—and feel stuck/i }).click();
  await expect(page.getByRole("heading", { name: "What should Bo help you do first?" })).toBeVisible();
  await expect(page.getByText("You do not need a perfect business plan.")).toBeVisible();
  await expect(page.getByText("What matters", { exact: true })).toBeVisible();
  await expect(page.getByText(/^\d{2}\/\d+$/)).toHaveCount(0);
});

test("the one-click unsubscribe destination confirms that journey emails stopped", async ({ page }) => {
  await page.goto("/start?email=unsubscribed");
  const notice = page.getByRole("status");
  await expect(notice).toContainText("Journey emails stopped");
  await expect(notice).toContainText("Journey reminder emails are now off.");
  await unlockLocalOnboarding(page);
  await expect(page.getByRole("heading", { name: "Where are you right now?" })).toBeVisible();
});

test("long founder context is saved immediately and survives refresh and Back", async ({ page }) => {
  await page.goto("/start");
  await unlockLocalOnboarding(page);
  await page.getByRole("button", { name: /I have an idea—or too many—and feel stuck/i }).click();
  await page.getByRole("button", { name: "Get my first paying customer" }).click();
  await page.getByRole("button", { name: "I do not know how to reach customers" }).click();

  const longIdea = `A meal-planning tool for busy parents that remembers what is already at home. ${"It should reduce late dinner decisions and food waste. ".repeat(12)}`;
  const answer = page.getByPlaceholder("It helps [who] to [do what]…");
  await answer.fill(longIdea);
  await expect(page.getByText(`${longIdea.length.toLocaleString()} / 1,500`)).toBeVisible();
  await page.getByRole("button", { name: "Use this as my starting point" }).click();
  await expect(page.getByRole("heading", { name: "Who can you realistically reach first?" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Who can you realistically reach first?" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByPlaceholder("It helps [who] to [do what]…")).toHaveValue(longIdea);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("badger-onboarding-v4") || "{}"));
  expect(saved.a.idea).toContain("meal-planning tool");
});

test("a founder without an idea can continue without facing a blank-page test", async ({ page }) => {
  await page.goto("/start");
  await unlockLocalOnboarding(page);
  await page.getByRole("button", { name: /I want more freedom or income, but have no idea/i }).click();
  await expect(page.getByText("You do not need an idea before you start.")).toBeVisible();
  await page.getByRole("button", { name: "Build income beside my current work" }).click();
  await page.getByRole("button", { name: "I keep changing direction" }).click();
  await page.getByRole("button", { name: "Run something local or practical" }).click();
  await page.getByRole("button", { name: "Access to possible customers" }).click();
  await page.getByPlaceholder("Or tell Bo: I know a lot about… I keep noticing…").fill("I know independent restaurants and local compliance work.");
  await page.getByRole("button", { name: "Show me directions I could take" }).click();
  await page.getByRole("button", { name: "People or organisations near me" }).click();
  await expect(page.getByRole("heading", { name: "Here are six directions worth a look." })).toBeVisible();
  await page.getByRole("button", { name: /Help small restaurants prepare for inspections/i }).click();
  await expect(page.getByRole("heading", { name: "What evidence do you have today?" })).toBeVisible();
});

test("the diagnostic earns a four-week plan before payment", async ({ page }) => {
  await page.route("**/api/plan", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: [] }) });
  });
  await page.goto("/start");
  await unlockLocalOnboarding(page);
  await page.getByRole("button", { name: /I have an idea—or too many—and feel stuck/i }).click();
  await page.getByRole("button", { name: "Get my first paying customer" }).click();
  await page.getByRole("button", { name: "I do not know how to reach customers" }).click();
  await page.getByPlaceholder("It helps [who] to [do what]…").fill("A service that helps independent cafés understand which menu items make money.");
  await page.getByRole("button", { name: "Use this as my starting point" }).click();
  await page.getByRole("button", { name: "Businesses or professionals" }).click();
  await page.getByRole("button", { name: "None yet" }).click();
  await page.getByRole("button", { name: "Build around this rhythm" }).click();
  await page.getByRole("button", { name: "I don't know who to ask." }).click();
  await page.getByRole("button", { name: "Challenge me directly" }).click();
  await page.getByRole("button", { name: "Build my journey" }).click();
  await page.getByRole("button", { name: "Build my journey around this →" }).click();

  await expect(page.getByRole("heading", { name: "Your 28-day launch path" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("WEEK 1", { exact: true })).toBeVisible();
  await expect(page.getByText("WEEK 4", { exact: true })).toBeVisible();
  await expect(page.getByText("YOUR FIRST MOVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Review one-time access" }).click();
  await expect(page.getByText("$49 once.", { exact: false })).toBeVisible();
  await expect(page.getByText("No subscription. Nothing renews. There is nothing to cancel later.")).toBeVisible();
});

for (const journey of [
  {
    track: "idea discovery",
    stage: /I want more freedom or income, but have no idea/i,
    placeholder: "Or tell Bo: I know a lot about… I keep noticing…",
    context: "I understand independent cafés and keep noticing how much food is wasted when owners cannot predict demand.",
  },
  {
    track: "built product",
    stage: /I built something, but nobody is paying/i,
    placeholder: "It helps [who] to [do what]…",
    context: "I built a simple ordering assistant for independent cafés that highlights profitable menu items.",
  },
]) {
  test(`the ${journey.track} route also reaches a personalised launch plan`, async ({ page }) => {
    await page.route("**/api/plan", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: [] }) });
    });
    await page.goto("/start");
    await unlockLocalOnboarding(page);
    await page.getByRole("button", { name: journey.stage }).click();
    await page.getByRole("button", { name: journey.track === "idea discovery" ? "Build income beside my current work" : "Know whether people truly want this" }).click();
    await page.getByRole("button", { name: "I keep changing direction" }).click();
    if (journey.track === "idea discovery") {
      await page.getByRole("button", { name: "I genuinely have no clue" }).click();
      await page.getByRole("button", { name: "Nothing obvious yet" }).click();
    }
    await page.getByPlaceholder(journey.placeholder).fill(journey.context);
    await page.getByRole("button", { name: journey.track === "idea discovery" ? "Show me directions I could take" : "Use this as my starting point" }).click();
    await page.getByRole("button", { name: "People I already know" }).click();
    if (journey.track === "idea discovery") await page.getByRole("button", { name: /Make allergen checks practical for small food sellers/i }).click();
    await page.getByRole("button", { name: "None yet" }).click();
    await page.getByRole("button", { name: "Build around this rhythm" }).click();
    await page.getByRole("button", { name: "Nobody will pay for it." }).click();
    await page.getByRole("button", { name: "Help me restart without shame" }).click();
    await page.getByRole("button", { name: "Build my journey" }).click();
    await page.getByRole("button", { name: "Build my journey around this →" }).click();
    await expect(page.getByRole("heading", { name: "Your 28-day launch path" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("YOUR FIRST MOVE", { exact: true })).toBeVisible();
  });
}

test("paid Bo APIs reject anonymous callers", async ({ request }) => {
  const response = await request.post("/api/coach", { data: { message: "Help me start" } });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: "authentication required" });
});

test("onboarding recovery cannot be created for an anonymous visitor", async ({ request }) => {
  const response = await request.post("/api/onboarding/capture", { data: { track: "A" } });
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: "authentication required" });
});

test("a user can start password recovery from sign in", async ({ page }) => {
  await page.goto("/auth?mode=signin");
  await page.getByRole("button", { name: "Forgot your password?" }).click();
  await expect(page.getByRole("heading", { name: "We’ll help you get back in." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
});

test("owner analytics reject anonymous callers", async ({ request }) => {
  const response = await request.get("/api/ops/summary");
  expect(response.status()).toBe(401);
});

test("tester operations reject anonymous writes", async ({ request }) => {
  const response = await request.post("/api/ops/testers", {
    data: { userId: "00000000-0000-4000-8000-000000000000", cohort: "private-beta", status: "active", feedbackTags: [], ownerNotes: "" },
  });
  expect(response.status()).toBe(401);
});

test("owner dashboard offers only Google sign-in", async ({ page }) => {
  await page.goto("/ops");
  await expect(page.getByRole("heading", { name: "Owner access only." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByPlaceholder("you@example.com")).toHaveCount(0);
});

test("owner dashboard adapts to mobile and desktop widths", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/ops");
  await expect(page.locator(".landing-site-shell")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321);

  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopShell = await page.locator(".landing-site-shell").boundingBox();
  expect(desktopShell?.width).toBeGreaterThan(1200);
});

test("terms state exact refund conditions and no guaranteed customer", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByText(/Nobody can guarantee a customer/)).toBeVisible();
  await expect(page.getByText(/all four conditions are met/)).toBeVisible();
  await expect(page.getByText(/within 14 days after Day 28/)).toBeVisible();
});
