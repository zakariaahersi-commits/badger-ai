# Badger Company OS

Badger Company OS is the owner-only control plane for running Badger AI with specialist DeepSeek agents. It is deliberately not a single unrestricted browser agent. The model analyses verified company data and proposes work; deterministic policy, budgets and the owner decide authority.

## Operating modes

- **Observe:** agents may analyse, but every proposed action waits for the owner.
- **Guarded (default):** allowlisted internal reports, drafts and owner alerts may complete automatically. Anything external, code-related, financial, permission-related or legal always requires owner approval.
- **Active:** a bounded agent can use an explicit standing owner mandate for opted-in customer-success emails or connected social publishing. Daily caps, consent checks, payload validation and the kill switch still apply.
- **Paused:** the global kill switch prevents every agent run.

The owner dashboard is `/ops/company`. It requires a valid Google OAuth session whose email is present in `OWNER_EMAILS`.

The dashboard uses the full desktop shell for every `/ops/*` route. Pending decisions remain clickable at 1280px and wider, successful decisions show an explicit confirmation, and failed requests stay visible instead of disappearing during refresh. The **Execution & incidents** section exposes approved, delegated and failed actions; permanent GitHub worker failures show the owner setup needed before another handoff is attempted.

The dashboard's autonomy-readiness map deliberately distinguishes **configured** from **operational**. Credentials alone never count as operational evidence: the DeepSeek loop needs a recent successful run, and email, engineering and social executors need a recent delegated or completed action. Missing one-time account setup, disabled alerting, degraded agents and the global pause state are shown directly to the owner without exposing secret values.

## Agent team

The first team contains CEO, Engineering, Customer Success, Growth, Content, Revenue, Compliance and QA agents. Each has its own mission, cadence, daily AI budget, action allowlist, status and autonomy level.

In the default **Guarded** configuration, CEO, Revenue and Compliance use `draft` authority so their allowlisted reports, observations and owner alerts do not become approval noise. This authority remains internal: customer contact, social publishing, money, code, access and legal commitments still follow the policy gate below.

Vercel calls `/api/company/run` every 10 minutes using `CRON_SECRET`. The route selects one due agent per invocation so a slow provider response cannot consume another agent's function budget. Each DeepSeek analysis gets up to three 15-second attempts; transient failures retry after 15 and then 30 minutes before the agent degrades on its third consecutive failure. `/api/company/actions/run` processes supported approved actions on an offset schedule. Runs use 15-minute idempotency slots, stop when the company or agent budget is exhausted, and record their input, output, tokens, cost, latency and outcome.

`/api/company/brief` is checked hourly and sends one private chairman brief at the configured local hour. It is reserved through the unique Company OS run ledger, so cron retries cannot send a second brief for the same local date. The brief goes to Telegram and the allowlisted owner email, separates paid founders from no-cost tester access, shows founder progress and operating failures, and names one evidence-based owner priority. Configure `COMPANY_OWNER_TIMEZONE` and `COMPANY_OWNER_BRIEF_HOUR`; defaults are `UTC` and `9`.

The `paying_founders` goal counts only active entitlements with a Stripe payment intent. No-cost Checkout/tester access remains visible as `testerAccess` but never contributes to paid-customer progress. Because Badger currently sells one-time access, the honest north-star is monthly collected revenue and paid founders—not MRR. A future recurring product can introduce MRR only after the billing model actually changes.

The dashboard also derives a seven-day acquisition funnel and a paid-founder activation/return signal from first-party events. The Capital room uses these verified measures to keep private fundraising materials ready without presenting Badger as investor-ready prematurely. At the current $49 one-time price, the $10,000 monthly revenue ambition requires 205 new full-price sales per month.

## Authority boundary

The policy in `lib/company-os/policy.ts` is application code, not prompt text. A model cannot change it. Email and social publishing require per-action owner approval by default. The owner may deliberately grant a standing mandate, but it only becomes effective in **Active** mode for an agent set to **Bounded**. These always require per-action owner approval and have no automatic executor:

- deploying code;
- changing pricing or budgets;
- issuing refunds;
- changing access or credentials;
- signing contracts.

Customer email resolves an opaque `userRef` on the server, requires an active paid entitlement and current email opt-in, includes one-click unsubscribe headers, and uses a Resend idempotency key. Social publishing uses either the direct Instagram professional-account API or one fixed HTTPS webhook. With direct Instagram, the model selects only from a committed owner-approved Badger asset catalogue; it cannot provide an image URL or destination account. The executor checks the expected username before every post and resumes from durable container checkpoints to avoid duplicates. A generic browser agent can never silently expand its own permissions.

## Connectors

Existing DeepSeek, Resend and Telegram environment values are detected without exposing their secrets. The preferred Instagram Login integration requires:

- `INSTAGRAM_BUSINESS_ACCOUNT_ID`: the professional account ID for `@badger.example.com`;
- `INSTAGRAM_BUSINESS_ACCESS_TOKEN`: a token scoped to `instagram_business_basic` and `instagram_business_content_publish`;
- `INSTAGRAM_EXPECTED_USERNAME=badger.example.com`: a fail-closed destination check;
- `INSTAGRAM_GRAPH_API_VERSION=v26.0`: the pinned Meta Graph API version.

This path publishes only approved JPEG assets deployed by Badger. It creates an Instagram media container, records the container ID before publication, waits for processing, publishes it, and records the returned media ID and permalink. A retry first checks recent media for the exact caption and closes the action without posting a duplicate.

An alternative external automation can instead use:

- `COMPANY_SOCIAL_WEBHOOK_URL`: a public HTTPS automation endpoint connected to company-owned accounts;
- `COMPANY_SOCIAL_WEBHOOK_SECRET`: the bearer secret expected by that endpoint.

The external automation must accept `{ actionId, brand, posts }`, honour the `Idempotency-Key` header and return a successful response only when the provider accepted the posts. If any direct Instagram value is present but the set is incomplete or invalid, the connector fails closed instead of silently falling back to the webhook. Account creation and token consent are a one-time human bootstrap because social platforms require a legal owner, recovery method and acceptance of their terms. Once connected, scheduled content can run under the bounded mandate.

GitHub worker scheduling is disabled in this distribution. To run an engineering worker, configure an external GeneralStaff-compatible worker with `COMPANY_ENGINEERING_WEBHOOK_URL` and `COMPANY_ENGINEERING_WEBHOOK_SECRET`. Leave these blank to keep the connector disabled.

DeepSeek remains the Company OS reasoning layer. Neither connector gives a Company OS reasoning agent a shell, source-control token or deployment credential.

For a closed-loop worker, configure `COMPANY_AUTOMATION_CALLBACK_SECRET`. The worker calls `POST /api/company/actions/callback` with the action-scoped token, the same action ID, `completed` or `failed`, a bounded summary, optional external job ID and optional public HTTPS pull-request URL. Company OS then closes the delegated action, audits the result and alerts the owner.

## Data and security

All Company OS tables are server-only. RLS is enabled, `anon` and `authenticated` have no grants, and only `service_role` can access them. The service-role key stays in server routes. Owner APIs separately require both Google OAuth and the exact owner email allowlist.

Every owner change and agent run is written to `company_audit_log`. The production RLS smoke test verifies that an ordinary signed-in founder cannot read settings, agents, runs or audit data and cannot mutate agents or actions.

## Release sequence

1. Apply all pending Supabase migrations to the linked project in version order.
2. Run `npm run test:supabase` against production credentials.
3. Deploy the application.
4. Open `/ops/company`, confirm **Guarded** mode and the daily budgets.
5. Run QA manually. Confirm its run, cost and brief appear.
6. Let one scheduled cycle run before enabling more autonomy.
7. Connect and test email/social in per-action approval mode before enabling either standing mandate.

Refunds, deployments, pricing, permissions and contracts remain owner-controlled. Autonomous account creation is intentionally excluded: platforms generally require a human legal owner, recovery method and acceptance of their terms.

## First-10 operating doctrine

The immediate goal is 10 genuinely paid founders. All agents receive the same evidence-backed doctrine: prefer the smallest move that creates verified payment intent, Day 1 progress, retained founder trust or useful learning. Shared operating memory includes recent agent summaries and action titles so agents do not repeatedly draft the same campaign or alert. Owner alerts are for a timely decision or material risk, not routine narration.

Fundraising is traction-gated. Agents may maintain an internal factsheet and investor-readiness checklist, but cannot invent deck metrics, investor interest, a valuation or a term sheet, and cannot contact investors or accept legal terms without owner approval. Until the first 10 paid founders and a credible retention signal exist, customer evidence outranks fundraising theatre.
