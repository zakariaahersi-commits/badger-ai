const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
const inboxId = process.env.AGENTMAIL_INBOX_ID?.trim() || process.env.AGENTMAIL_INBOX?.trim();
const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com").replace(/\/$/, "");
const url = `${site}/api/agentmail/webhook`;

if (!apiKey || !inboxId) throw new Error("AGENTMAIL_API_KEY and AGENTMAIL_INBOX_ID (or AGENTMAIL_INBOX) are required");

async function request(path, init = {}) {
  const response = await fetch(`https://api.agentmail.to/v0${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`AgentMail ${path} returned ${response.status}`);
  return body;
}

const inbox = await request(`/inboxes/${encodeURIComponent(inboxId)}`);
if (!inbox || inbox.inbox_id !== inboxId) throw new Error("AgentMail inbox identity did not match the configured inbox");

const listed = await request("/webhooks?limit=100");
const current = Array.isArray(listed?.webhooks)
  ? listed.webhooks.find((item) => item?.url === url && item?.enabled === true && Array.isArray(item.event_types) && item.event_types.includes("message.received") && Array.isArray(item.inbox_ids) && item.inbox_ids.includes(inboxId))
  : null;
const webhook = current || await request("/webhooks", {
  method: "POST",
  body: JSON.stringify({ url, event_types: ["message.received"], inbox_ids: [inboxId], client_id: "badger-company-os" }),
});

if (!webhook?.webhook_id || !webhook?.secret) throw new Error("AgentMail did not return a signed webhook secret");
process.stderr.write(`${current ? "Verified" : "Created"} AgentMail webhook ${webhook.webhook_id} for ${url}\n`);
if (process.argv.includes("--secret-only")) process.stdout.write(String(webhook.secret));
else process.stdout.write(JSON.stringify({ configured: true, created: !current, webhookId: webhook.webhook_id, url }));
