import "server-only";

import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderBoEmail } from "@/lib/bo-email";
import { emailUnsubscribeUrl } from "@/lib/email-preferences";
import { sendOwnerTelegramAlert } from "@/lib/telegram";
import { normalizeCompanyEmail, normalizeCompanyInboxReply, normalizeEngineeringJob, normalizePreparedSocialContent, normalizeSocialPosts } from "@/lib/company-os/execution-policy";
import { engineeringConnector } from "@/lib/company-os/engineering-connector";
import { companyActionFailureAlert, isPermanentCompanyActionFailure, OWNER_ALERT_COOLDOWN_MS } from "@/lib/company-os/policy";
import { normalizeInstagramPublication, publishInstagramImage, socialConnector } from "@/lib/company-os/social-connector";
import type { CompanyActionType } from "@/lib/company-os/types";
import { replyToAgentMailMessage } from "@/lib/company-os/agentmail";
import { createHeyGenVideo, downloadRenderedVideo, heyGenConnector, normalizeUgcRenderJob, retrieveHeyGenVideo } from "@/lib/company-os/ugc-renderer";

type CompanyAction = {
  id: string; agent_id: string; action_type: CompanyActionType; payload: Record<string, unknown>;
  title: string; rationale: string; attempt_count: number; status: string; result?: Record<string, unknown> | null;
};

export type CompanyExecutionResult = { id: string; status: "delegated" | "completed" | "queued" | "failed" | "cancelled" | "skipped"; message: string };

function utcDayStart(now: Date): string { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString(); }
function nextUtcDay(now: Date): string { return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(); }

async function shouldSendFailureAlert(service: SupabaseClient, action: CompanyAction, code: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - OWNER_ALERT_COOLDOWN_MS).toISOString();
  const { data, error } = await service.from("company_actions")
    .select("id")
    .eq("action_type", action.action_type)
    .eq("status", "failed")
    .eq("error_code", code)
    .neq("id", action.id)
    .gte("executed_at", since)
    .limit(1);
  return error ? true : !(data?.length);
}

async function finish(service: SupabaseClient, action: CompanyAction, status: "delegated" | "completed" | "failed" | "cancelled", result: Record<string, unknown>, errorCode: string | null = null) {
  const now = new Date().toISOString();
  const updated = await service.from("company_actions").update({ status, result, error_code: errorCode, executed_at: now }).eq("id", action.id).eq("status", "executing").select("id").maybeSingle();
  if (updated.error || !updated.data) throw new Error("action_state_update_failed");
  const logged = await service.from("company_audit_log").insert({ actor_type: "system", actor_id: "company_action_executor", event_type: `action.${status}`, object_type: "company_action", object_id: action.id, details: { actionType: action.action_type, agentId: action.agent_id, errorCode } });
  if (logged.error) console.warn("[company-os] audit insert failed", logged.error.code ?? "database_error");
}

async function executeCustomerEmail(service: SupabaseClient, action: CompanyAction): Promise<CompanyExecutionResult> {
  const email = normalizeCompanyEmail(action.payload);
  const [profile, entitlement, preference, recentEmail] = await Promise.all([
    service.from("profiles").select("user_id, email, name, notify").eq("user_id", email.userRef).maybeSingle(),
    service.from("entitlements").select("user_id").eq("user_id", email.userRef).eq("product", "badger-28-day").eq("status", "active").not("stripe_payment_intent_id", "is", null).maybeSingle(),
    service.from("email_preferences").select("journey_nudges_enabled").eq("user_id", email.userRef).maybeSingle(),
    service.from("email_events").select("id").eq("user_id", email.userRef).in("event_type", ["email.sent", "email.delivered"]).gte("occurred_at", new Date(Date.now() - 20 * 60 * 60_000).toISOString()).limit(1),
  ]);
  if (profile.error || entitlement.error || preference.error || recentEmail.error) throw new Error("recipient_context_unavailable");
  if (!profile.data?.email || !entitlement.data || profile.data.notify === false || preference.data?.journey_nudges_enabled !== true) {
    await finish(service, action, "cancelled", { delivered: false, reason: "recipient_not_eligible" }, "recipient_not_eligible");
    return { id: action.id, status: "cancelled", message: "Recipient is not eligible or opted in." };
  }
  if (recentEmail.data?.length) {
    const queued = await service.from("company_actions").update({ status: "approved", attempt_count: Math.max(0, action.attempt_count - 1), available_at: new Date(Date.now() + 20 * 60 * 60_000).toISOString(), error_code: "recipient_cooldown" }).eq("id", action.id).eq("status", "executing");
    if (queued.error) throw new Error("action_state_update_failed");
    return { id: action.id, status: "queued", message: "Recipient recently received an email; queued after cooldown." };
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NUDGE_FROM;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://badger.example.com";
  const unsubscribe = emailUnsubscribeUrl(email.userRef, site);
  if (!apiKey || !from || !unsubscribe) throw new Error("email_not_configured");
  const body = renderBoEmail({
    name: profile.data.name,
    preview: email.content.slice(0, 120),
    paragraphs: email.content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
    action: { label: "Open Badger AI", href: `${site}/app` },
    footer: "You received this because you asked Bo to support your 28-day founder journey.",
    footerAction: { label: "Stop journey emails", href: unsubscribe },
  });
  const response = await new Resend(apiKey).emails.send({
    from, to: profile.data.email, subject: email.subject, html: body.html, text: body.text,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "user_id", value: email.userRef }, { name: "category", value: "company_customer_success" }],
  }, { idempotencyKey: `company-action/${action.id}` });
  if (response.error) throw new Error(`resend_${response.error.name ?? "failed"}`);
  await finish(service, action, "completed", { provider: "resend", messageId: response.data?.id ?? null });
  await service.from("product_events").insert({ user_id: email.userRef, event_name: "company_customer_success_email_sent", properties: { actionId: action.id, agentId: action.agent_id } });
  return { id: action.id, status: "completed", message: "Customer-success email sent." };
}

async function executeCompanyInboxReply(service: SupabaseClient, action: CompanyAction): Promise<CompanyExecutionResult> {
  const reply = normalizeCompanyInboxReply(action.payload);
  const message = await service.from("company_email_messages")
    .select("id,inbox_id,thread_id,message_id,sender_email,status")
    .eq("action_id", action.id)
    .eq("inbox_id", reply.inboxId)
    .eq("thread_id", reply.threadId)
    .eq("message_id", reply.messageId)
    .eq("sender_email", reply.recipientEmail)
    .eq("status", "waiting_approval")
    .maybeSingle();
  if (message.error) throw new Error("company_inbox_unavailable");
  if (!message.data) throw new Error("invalid_company_email_thread");
  const sent = await replyToAgentMailMessage({ inboxId: reply.inboxId, messageId: reply.messageId, content: reply.content, actionId: action.id });
  await finish(service, action, "completed", { provider: "agentmail", externalId: sent.messageId, threadId: sent.threadId });
  const updated = await service.from("company_email_messages")
    .update({ status: "replied", updated_at: new Date().toISOString() })
    .eq("id", message.data.id)
    .eq("status", "waiting_approval");
  if (updated.error) console.warn("[company-os] company inbox state update failed", updated.error.code ?? "database_error");
  return { id: action.id, status: "completed", message: "Company inbox reply sent." };
}

async function executeSocialPost(service: SupabaseClient, action: CompanyAction): Promise<CompanyExecutionResult> {
  const connector = socialConnector();
  if (!connector) throw new Error("social_not_configured");
  if (connector.provider === "instagram") {
    const publication = normalizeInstagramPublication(action.payload, connector.site);
    const prior = action.result && typeof action.result === "object" ? action.result : {};
    const existingContainerId = typeof prior.containerId === "string" ? prior.containerId : null;
    const published = await publishInstagramImage({
      connector,
      caption: publication.caption,
      imageUrl: publication.imageUrl,
      existingContainerId,
      onContainerCreated: async (containerId) => {
        const checkpoint = await service.from("company_actions").update({
          result: { provider: "instagram", stage: "container_created", containerId, assetId: publication.assetId },
        }).eq("id", action.id).eq("status", "executing").select("id").maybeSingle();
        if (checkpoint.error || !checkpoint.data) throw new Error("action_state_update_failed");
      },
    });
    await finish(service, action, "completed", {
      provider: "instagram",
      externalId: published.mediaId,
      permalink: published.permalink,
      containerId: published.containerId,
      assetId: publication.assetId,
      channels: ["instagram"],
      recovered: published.recovered,
    });
    return { id: action.id, status: "completed", message: published.recovered ? "Instagram post verified without publishing a duplicate." : "Published to Instagram." };
  }
  const posts = normalizeSocialPosts(action.payload);
  const response = await fetch(connector.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${connector.secret}`, "Idempotency-Key": `badger-company-${action.id}` },
    body: JSON.stringify({ actionId: action.id, brand: "Badger AI", posts }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`social_provider_${response.status}`);
  const provider = await response.json().catch(() => ({})) as Record<string, unknown>;
  await finish(service, action, "completed", { provider: "webhook", externalId: typeof provider.id === "string" ? provider.id.slice(0, 200) : null, channels: Object.keys(posts) });
  return { id: action.id, status: "completed", message: `Published to ${Object.keys(posts).join(", ")}.` };
}

async function executeEngineeringJob(service: SupabaseClient, action: CompanyAction): Promise<CompanyExecutionResult> {
  const job = normalizeEngineeringJob(action.payload);
  const connector = engineeringConnector();
  if (!connector) throw new Error("engineering_not_configured");
  if (connector.provider === "github") {
    await finish(service, action, "delegated", { provider: "github_deepseek_worker", repository: connector.repository, state: "waiting_claim", queuedAt: new Date().toISOString(), inferenceCalls: 0, title: job.title });
    return { id: action.id, status: "delegated", message: "Engineering work queued for the bounded DeepSeek GitHub worker." };
  }
  const response = await fetch(connector.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${connector.secret}`, "Idempotency-Key": `badger-engineering-${action.id}` },
    body: JSON.stringify({ actionId: action.id, source: "badger-company-os", repository: process.env.GITHUB_REPOSITORY ?? null, job }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`engineering_provider_${response.status}`);
  const provider = await response.json().catch(() => ({})) as Record<string, unknown>;
  await finish(service, action, "delegated", { provider: "engineering_webhook", externalId: typeof provider.id === "string" ? provider.id.slice(0, 200) : null, state: "queued" });
  return { id: action.id, status: "delegated", message: "Engineering work delegated to the GeneralStaff/DeepSeek worker." };
}

async function executeUgcVideo(service: SupabaseClient, action: CompanyAction): Promise<CompanyExecutionResult> {
  const connector = heyGenConnector();
  if (!connector) throw new Error("ugc_renderer_not_configured");
  const job = normalizeUgcRenderJob(action.payload);
  const prepared = await service.from("company_actions")
    .select("id,status,action_type,payload")
    .eq("id", job.preparedActionId)
    .eq("action_type", "prepare_social_content")
    .eq("status", "completed")
    .maybeSingle();
  if (prepared.error) throw new Error("prepared_ugc_unavailable");
  if (!prepared.data) throw new Error("invalid_prepared_ugc_reference");
  const storedPayload = prepared.data.payload && typeof prepared.data.payload === "object" && !Array.isArray(prepared.data.payload)
    ? normalizePreparedSocialContent(prepared.data.payload as Record<string, unknown>)
    : null;
  if (!storedPayload || JSON.stringify(storedPayload) !== JSON.stringify(job.prepared)) throw new Error("invalid_prepared_ugc_reference");
  const generated = await createHeyGenVideo({ connector, job });
  await finish(service, action, "delegated", {
    provider: "heygen",
    state: "pending",
    videoId: generated.videoId,
    preparedActionId: job.preparedActionId,
    disclosure: job.prepared.ugc.disclosure,
    queuedAt: new Date().toISOString(),
  });
  return { id: action.id, status: "delegated", message: "AI-avatar video render queued with HeyGen." };
}

export async function reconcileUgcVideoAction(service: SupabaseClient, actionId: string): Promise<CompanyExecutionResult> {
  const connector = heyGenConnector();
  if (!connector) return { id: actionId, status: "failed", message: "ugc_renderer_not_configured" };
  const { data: action, error } = await service.from("company_actions")
    .select("id,agent_id,action_type,title,result")
    .eq("id", actionId)
    .eq("action_type", "queue_ugc_video")
    .eq("status", "delegated")
    .maybeSingle();
  if (error) return { id: actionId, status: "failed", message: "ugc_render_state_unavailable" };
  if (!action) return { id: actionId, status: "skipped", message: "already_reconciled" };
  const result = action.result && typeof action.result === "object" && !Array.isArray(action.result) ? action.result as Record<string, unknown> : {};
  const videoId = typeof result.videoId === "string" ? result.videoId : "";
  if (!videoId) {
    const code = "invalid_ugc_render_receipt";
    await service.from("company_actions").update({ status: "failed", error_code: code, executed_at: new Date().toISOString() }).eq("id", actionId).eq("status", "delegated");
    return { id: actionId, status: "failed", message: code };
  }
  try {
    const status = await retrieveHeyGenVideo({ connector, videoId });
    if (["pending", "waiting", "processing"].includes(status.state)) {
      const updated = await service.from("company_actions").update({ result: { ...result, state: status.state, checkedAt: new Date().toISOString() } }).eq("id", actionId).eq("status", "delegated");
      if (updated.error) throw new Error("action_state_update_failed");
      return { id: actionId, status: "delegated", message: `AI-avatar render is ${status.state}.` };
    }
    if (status.state === "failed") {
      const code = "heygen_render_failed";
      const failed = await service.from("company_actions").update({ status: "failed", result: { ...result, state: "failed", providerError: status.error }, error_code: code, executed_at: new Date().toISOString() }).eq("id", actionId).eq("status", "delegated").select("id").maybeSingle();
      if (failed.error || !failed.data) throw new Error("action_state_update_failed");
      await sendOwnerTelegramAlert(`🦡 AI-avatar render failed\n${action.title}\nReference: ${code}`);
      return { id: actionId, status: "failed", message: code };
    }
    const video = await downloadRenderedVideo({ videoUrl: status.videoUrl! });
    const storagePath = `ugc/${actionId}/${videoId}.mp4`;
    const uploaded = await service.storage.from("company-content").upload(storagePath, video, { contentType: "video/mp4", upsert: false });
    const storageStatus = Number((uploaded.error as { statusCode?: string | number } | null)?.statusCode ?? 0);
    const alreadyExists = storageStatus === 409 || /already exists|duplicate/i.test(uploaded.error?.message ?? "");
    if (uploaded.error && !alreadyExists) throw new Error("ugc_storage_failed");
    const completedAt = new Date().toISOString();
    const completedResult = { ...result, state: "completed", storageBucket: "company-content", storagePath, thumbnailUrl: status.thumbnailUrl, completedAt };
    const completed = await service.from("company_actions").update({ status: "completed", result: completedResult, error_code: null, executed_at: completedAt }).eq("id", actionId).eq("status", "delegated").select("id").maybeSingle();
    if (completed.error || !completed.data) throw new Error("action_state_update_failed");
    await Promise.all([
      service.from("company_audit_log").insert({ actor_type: "system", actor_id: "ugc_renderer", event_type: "action.completed", object_type: "company_action", object_id: actionId, details: { provider: "heygen", videoId, storagePath } }),
      sendOwnerTelegramAlert(`🦡 AI-avatar video ready\n${action.title}\nSaved privately in Company OS. It has not been published.`),
    ]);
    return { id: actionId, status: "completed", message: "AI-avatar video rendered and saved privately." };
  } catch (caught) {
    const code = caught instanceof Error ? caught.message.slice(0, 120) : "ugc_render_reconcile_failed";
    if (isPermanentCompanyActionFailure(code)) {
      const failed = await service.from("company_actions").update({ status: "failed", result: { ...result, state: "failed" }, error_code: code, executed_at: new Date().toISOString() }).eq("id", actionId).eq("status", "delegated").select("id").maybeSingle();
      if (!failed.error && failed.data) await sendOwnerTelegramAlert(`🦡 AI-avatar render failed\n${action.title}\nReference: ${code}`);
    } else {
      await service.from("company_actions").update({ result: { ...result, checkedAt: new Date().toISOString(), lastError: code } }).eq("id", actionId).eq("status", "delegated");
    }
    return { id: actionId, status: "failed", message: code };
  }
}

export async function executeCompanyAction(service: SupabaseClient, actionId: string, now = new Date()): Promise<CompanyExecutionResult> {
  const { data: settings, error: settingsError } = await service.from("company_os_settings").select("paused, max_daily_emails, max_daily_social_posts, max_daily_engineering_jobs").eq("id", "badger").single();
  if (settingsError || !settings) return { id: actionId, status: "failed", message: "settings_unavailable" };
  if (settings.paused) return { id: actionId, status: "skipped", message: "company_paused" };
  const candidate = await service.from("company_actions").select("id, attempt_count").eq("id", actionId).eq("status", "approved").lte("available_at", now.toISOString()).maybeSingle();
  if (candidate.error) return { id: actionId, status: "failed", message: "claim_failed" };
  if (!candidate.data) return { id: actionId, status: "skipped", message: "already_claimed" };
  const nextAttempt = Number(candidate.data.attempt_count) + 1;
  const { data: action, error: claimError } = await service.from("company_actions")
    .update({ status: "executing", attempt_count: nextAttempt, error_code: null })
    .eq("id", actionId).eq("status", "approved").eq("attempt_count", candidate.data.attempt_count).lte("available_at", now.toISOString())
    .select("id, agent_id, action_type, payload, title, rationale, attempt_count, status, result").maybeSingle();
  if (claimError) return { id: actionId, status: "failed", message: "claim_failed" };
  if (!action) return { id: actionId, status: "skipped", message: "already_claimed" };
  const row = action as CompanyAction;
  const emailAction = row.action_type === "send_customer_email" || row.action_type === "reply_company_email";
  const cap = emailAction ? Number(settings.max_daily_emails) : row.action_type === "publish_social_content" ? Number(settings.max_daily_social_posts) : row.action_type === "queue_engineering_work" ? Math.min(1, Number(settings.max_daily_engineering_jobs)) : row.action_type === "queue_ugc_video" ? 1 : 0;
  let usageQuery = service.from("company_actions").select("id", { count: "exact", head: true }).in("status", ["delegated", "completed"]).gte("executed_at", utcDayStart(now));
  usageQuery = emailAction ? usageQuery.in("action_type", ["send_customer_email", "reply_company_email"]) : usageQuery.eq("action_type", row.action_type);
  const { count, error: countError } = await usageQuery;
  if (countError) {
    try { await finish(service, row, "failed", {}, "usage_ledger_unavailable"); } catch { return { id: actionId, status: "failed", message: "action_state_update_failed" }; }
    return { id: actionId, status: "failed", message: "usage_ledger_unavailable" };
  }
  if ((count ?? 0) >= cap) {
    await service.from("company_actions").update({ status: "approved", attempt_count: Math.max(0, row.attempt_count - 1), available_at: nextUtcDay(now), error_code: "daily_cap_reached" }).eq("id", actionId).eq("status", "executing");
    return { id: actionId, status: "queued", message: "Daily cap reached; queued for tomorrow." };
  }
  try {
    if (row.action_type === "send_customer_email") return await executeCustomerEmail(service, row);
    if (row.action_type === "reply_company_email") return await executeCompanyInboxReply(service, row);
    if (row.action_type === "publish_social_content") return await executeSocialPost(service, row);
    if (row.action_type === "queue_engineering_work") return await executeEngineeringJob(service, row);
    if (row.action_type === "queue_ugc_video") return await executeUgcVideo(service, row);
    await finish(service, row, "failed", {}, "unsupported_action");
    return { id: actionId, status: "failed", message: "unsupported_action" };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : "execution_failed";
    const permanent = isPermanentCompanyActionFailure(code);
    if (!permanent && row.attempt_count < 3) {
      await service.from("company_actions").update({ status: "approved", available_at: new Date(now.getTime() + row.attempt_count * 60_000).toISOString(), error_code: code }).eq("id", actionId).eq("status", "executing");
      return { id: actionId, status: "queued", message: "Temporary failure; queued to retry." };
    }
    const sendFailureAlert = await shouldSendFailureAlert(service, row, code, now);
    try { await finish(service, row, "failed", {}, code); } catch { return { id: actionId, status: "failed", message: "action_state_update_failed" }; }
    if (sendFailureAlert) await sendOwnerTelegramAlert(companyActionFailureAlert({ actionType: row.action_type, title: row.title, code }));
    return { id: actionId, status: "failed", message: code };
  }
}
