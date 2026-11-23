import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { normalizeCompanyInboxReply } from "@/lib/company-os/execution-policy";
import { companyInboxConnectorReady } from "@/lib/company-os/agentmail";

async function owner(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return { error: NextResponse.json({ error: "authentication required" }, { status: 401 }) };
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) return { error: NextResponse.json({ error: "Google owner access required" }, { status: 403 }) };
  return { auth };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await owner(req);
  if ("error" in access) return access.error;
  const { id } = await context.params;
  const messageId = Number(id);
  if (!Number.isInteger(messageId) || messageId < 1) return NextResponse.json({ error: "invalid message" }, { status: 400 });
  const body = await req.json().catch(() => null) as { operation?: unknown; content?: unknown } | null;
  const operation = body?.operation;
  if (operation !== "reply" && operation !== "ignore") return NextResponse.json({ error: "invalid operation" }, { status: 400 });
  const service = access.auth.service!;
  const message = await service.from("company_email_messages")
    .select("id,inbox_id,thread_id,message_id,sender_email,sender_name,subject,status")
    .eq("id", messageId)
    .in("status", ["new", "failed", "escalated"])
    .maybeSingle();
  if (message.error) return NextResponse.json({ error: "Company inbox unavailable" }, { status: 503 });
  if (!message.data) return NextResponse.json({ error: "Message is no longer pending" }, { status: 409 });
  const now = new Date().toISOString();
  if (operation === "ignore") {
    const ignored = await service.from("company_email_messages").update({ status: "ignored", updated_at: now }).eq("id", messageId).eq("status", message.data.status).select("id").maybeSingle();
    if (ignored.error || !ignored.data) return NextResponse.json({ error: "Message changed; refresh and try again" }, { status: 409 });
    await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: "company_email.ignored", object_type: "company_email_message", object_id: String(messageId), details: { channel: "web" } });
    return NextResponse.json({ status: "ignored" });
  }
  if (!companyInboxConnectorReady()) return NextResponse.json({ error: "AgentMail reply connector is not configured" }, { status: 409 });
  let reply;
  try {
    reply = normalizeCompanyInboxReply({ inboxId: message.data.inbox_id, messageId: message.data.message_id, threadId: message.data.thread_id, recipientEmail: message.data.sender_email, subject: message.data.subject, content: body?.content });
  } catch {
    return NextResponse.json({ error: "Reply must contain 1–3,000 characters" }, { status: 400 });
  }
  const digest = createHash("sha256").update(`${reply.inboxId}:${reply.messageId}`).digest("hex").slice(0, 32);
  const run = await service.from("company_runs").insert({ agent_id: "customer_success", trigger_type: "manual", status: "completed", summary: "Owner queued a reply to a verified company inbox thread.", input: { companyEmailMessageId: messageId }, output: { ownerAuthored: true }, idempotency_key: `company:inbox:owner:${digest}`, started_at: now, completed_at: now }).select("id").single();
  if (run.error || !run.data) return NextResponse.json({ error: run.error?.code === "23505" ? "A reply is already queued for this message" : "Reply queue unavailable" }, { status: run.error?.code === "23505" ? 409 : 503 });
  const action = await service.from("company_actions").insert({
    run_id: run.data.id,
    agent_id: "customer_success",
    action_type: "reply_company_email",
    risk: "external",
    status: "approved",
    requires_approval: true,
    title: `Reply to ${String(message.data.sender_name || "company inbox sender").slice(0, 80)}`,
    rationale: "The authenticated owner wrote this exact reply and explicitly chose Send reply.",
    payload: reply,
    idempotency_key: `company:inbox:reply:${digest}`,
    approved_by: access.auth.userId,
    approved_at: now,
  }).select("id").single();
  if (action.error || !action.data) return NextResponse.json({ error: "Reply queue unavailable" }, { status: action.error?.code === "23505" ? 409 : 503 });
  const linked = await service.from("company_email_messages")
    .update({ status: "waiting_approval", action_id: action.data.id, triage: { ownerAuthored: true }, updated_at: now })
    .eq("id", messageId)
    .eq("status", message.data.status)
    .select("id")
    .maybeSingle();
  if (linked.error || !linked.data) {
    await service.from("company_actions").update({ status: "cancelled", error_code: "message_state_changed", executed_at: now }).eq("id", action.data.id).eq("status", "approved");
    return NextResponse.json({ error: "Message changed; reply was not sent" }, { status: 409 });
  }
  await service.from("company_audit_log").insert({ actor_type: "owner", actor_id: access.auth.userId, event_type: "company_email.reply_approved", object_type: "company_email_message", object_id: String(messageId), details: { actionId: action.data.id, channel: "web" } });
  return NextResponse.json({ status: "queued", actionId: action.data.id });
}
