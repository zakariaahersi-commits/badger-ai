import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const baseUrl = (process.env.BADGER_QA_BASE_URL ?? "https://badger.example.com").replace(/\/$/, "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!baseUrl.startsWith("https://") || !supabaseUrl || !anonKey || !serviceKey) {
  throw new Error("launch readiness requires the production URL and Supabase credentials");
}

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const report = { baseUrl, checks: {} };
let userId;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function since(hours) {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

try {
  const landing = await fetch(baseUrl, { redirect: "follow" });
  const landingHtml = await landing.text();
  assert(landing.ok, `landing returned ${landing.status}`);
  assert(/Your AI co-founder/i.test(landingHtml), "landing did not contain the approved product promise");
  const csp = landing.headers.get("content-security-policy") ?? "";
  assert(csp.includes("default-src 'self'"), "content-security-policy is missing or unexpectedly broad");
  assert(landing.headers.get("x-content-type-options") === "nosniff", "nosniff header is missing");
  assert(Boolean(landing.headers.get("referrer-policy")), "referrer policy is missing");
  report.checks.site = { status: landing.status, securityHeaders: true };

  const [manifest, serviceWorker] = await Promise.all([
    fetch(`${baseUrl}/manifest.json`),
    fetch(`${baseUrl}/sw.js`),
  ]);
  assert(manifest.ok, `manifest returned ${manifest.status}`);
  assert(serviceWorker.ok, `service worker returned ${serviceWorker.status}`);
  const manifestBody = await manifest.json();
  assert(Array.isArray(manifestBody.icons) && manifestBody.icons.length >= 2, "manifest icons are incomplete");
  report.checks.pwa = { manifest: manifest.status, serviceWorker: serviceWorker.status };

  const authSettingsResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey },
  });
  const authSettings = await authSettingsResponse.json();
  assert(authSettingsResponse.ok, "Supabase Auth settings are unavailable");
  assert(authSettings?.external?.google === true, "Google sign-in is not enabled in production Supabase Auth");
  report.checks.auth = { google: true, email: authSettings?.external?.email === true };

  const push = await json("/api/push/key");
  assert(
    push.response.ok &&
      push.body?.configured === true &&
      typeof push.body?.publicKey === "string" &&
      push.body.publicKey.length > 40,
    "production push is not configured",
  );
  report.checks.push = { configured: true };

  const anonymousCoach = await json("/api/coach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hello" }),
  });
  assert(anonymousCoach.response.status === 401, "paid coach accepted an anonymous request");

  const [anonymousCompany, anonymousCompanyActions, anonymousCompanyCallback] = await Promise.all([
    json("/api/ops/company"),
    json("/api/company/actions/run"),
    json("/api/company/actions/callback", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  ]);
  assert(anonymousCompany.response.status === 401, "Company OS owner API accepted an anonymous request");
  assert(anonymousCompanyActions.response.status === 401, "Company OS executor accepted an anonymous request");
  assert(anonymousCompanyCallback.response.status === 401, "Company OS callback accepted an anonymous request");
  const [companySettings, companyAgents] = await Promise.all([
    admin.from("company_os_settings").select("mode, paused, max_daily_ai_spend_usd").eq("id", "badger").single(),
    admin.from("company_agents").select("id, status, autonomy"),
  ]);
  if (companySettings.error) throw companySettings.error;
  if (companyAgents.error) throw companyAgents.error;
  assert(companyAgents.data.length === 8, "Company OS specialist team is incomplete");
  report.checks.companyOS = { mode: companySettings.data.mode, paused: companySettings.data.paused, agents: companyAgents.data.length, privateRoutes: true };

  const suffix = randomUUID();
  const email = `badger-launch-checkout-${suffix}@example.com`;
  const password = `Qa-${randomUUID()}-9!`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("could not create checkout QA user");
  userId = created.data.user.id;
  const signedIn = await authClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.access_token) throw signedIn.error ?? new Error("could not sign in checkout QA user");
  const checkout = await json("/api/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${signedIn.data.session.access_token}`,
    },
    body: JSON.stringify({ cancelPath: "/start" }),
  });
  assert(checkout.response.ok, `checkout returned ${checkout.response.status}`);
  assert(checkout.body?.configured === true && checkout.body?.mode === "payment", "checkout is not configured as a one-time payment");
  assert(/^https:\/\/checkout\.stripe\.com\//.test(checkout.body?.url ?? ""), "checkout did not return a Stripe-hosted URL");
  report.checks.checkout = { configured: true, mode: "payment", provider: "stripe" };

  const [stripeEvents, emailEvents, aiFailures, clientErrors] = await Promise.all([
    admin.from("stripe_webhook_events").select("status,created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("email_events").select("event_type,occurred_at").order("occurred_at", { ascending: false }).limit(200),
    admin.from("ai_usage_events").select("feature,error_code,created_at").eq("success", false).gte("created_at", since(24)).limit(100),
    admin.from("product_events").select("created_at").eq("event_name", "client_error").gte("created_at", since(24)).limit(100),
  ]);
  if (stripeEvents.error) throw stripeEvents.error;
  if (emailEvents.error) throw emailEvents.error;
  if (aiFailures.error) throw aiFailures.error;
  if (clientErrors.error) throw clientErrors.error;
  assert(stripeEvents.data.some((event) => event.status === "processed"), "no processed Stripe webhook event is recorded");
  assert(emailEvents.data.some((event) => event.event_type === "email.sent" || event.event_type === "email.delivered"), "no verified Resend send or delivery event is recorded");
  report.checks.telemetry = {
    stripeEvents: stripeEvents.data.length,
    emailEvents: emailEvents.data.length,
    aiFailures24h: aiFailures.data.length,
    aiFailureBreakdown: Object.entries(
      aiFailures.data.reduce((counts, event) => {
        const key = `${event.feature ?? "unknown"}:${event.error_code ?? "unknown"}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      }, {}),
    ).map(([type, count]) => ({ type, count })),
    clientErrors24h: clientErrors.data.length,
  };

  report.passed = true;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (userId) {
    await admin.from("ai_usage_events").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
}
