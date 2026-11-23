import { NextRequest, NextResponse } from "next/server";
import { generateLinkCode, messagingConfigured, normalizePhone, privateDigest } from "@/lib/messaging/crypto";
import { activeMessagingProvider, enrollProviderContact, providerNumber } from "@/lib/messaging/provider";
import { paidAccessState } from "@/lib/paid-access";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const provider = activeMessagingProvider();
  const { data, error } = await auth.service.from("messaging_channels")
    .select("status, consent_at, last_inbound_at, last_outbound_at")
    .eq("user_id", auth.userId)
    .eq("provider", provider ?? "sendblue")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "messaging status unavailable" }, { status: 503 });
  return NextResponse.json({
    configured: messagingConfigured(),
    provider,
    connected: Boolean(data),
    status: data?.status ?? "not_connected",
    consentAt: data?.consent_at ?? null,
    lastInboundAt: data?.last_inbound_at ?? null,
    lastOutboundAt: data?.last_outbound_at ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const access = await paidAccessState(auth);
  if (access === "unavailable") return NextResponse.json({ error: "access check unavailable" }, { status: 503 });
  if (access !== "active") return NextResponse.json({ error: "payment or tester access required" }, { status: 402 });
  if (!messagingConfigured()) return NextResponse.json({ error: "iMessage pilot is not configured yet" }, { status: 503 });
  const provider = activeMessagingProvider();
  if (!provider) return NextResponse.json({ error: "iMessage pilot is not configured yet" }, { status: 503 });

  let phone: string | null = null;
  if (provider === "sendblue") {
    const body = await req.json().catch(() => ({})) as { phone?: unknown };
    phone = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    if (!phone) return NextResponse.json({ error: "Enter your iPhone number with country code, for example +46…" }, { status: 400 });
    const { data: profile } = await auth.service.from("profiles").select("name").eq("user_id", auth.userId).maybeSingle();
    try {
      await enrollProviderContact(provider, phone, typeof profile?.name === "string" ? profile.name : undefined);
    } catch {
      return NextResponse.json({ error: "Could not reserve this phone in the 10-person pilot" }, { status: 503 });
    }
  }

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const { error } = await auth.service.from("messaging_link_codes").upsert({
    user_id: auth.userId,
    provider,
    code_digest: privateDigest(code),
    expires_at: expiresAt,
    used_at: null,
    created_at: new Date().toISOString(),
  }, { onConflict: "user_id,provider" });
  if (error) return NextResponse.json({ error: "could not create connection code" }, { status: 503 });

  const number = providerNumber(provider);
  const message = `START ${code}`;
  return NextResponse.json({
    provider,
    code,
    message,
    number,
    expiresAt,
    deepLink: `sms:${number}&body=${encodeURIComponent(message)}`,
  });
}

export async function DELETE(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  const provider = activeMessagingProvider();
  if (!provider) return NextResponse.json({ error: "iMessage pilot is not configured yet" }, { status: 503 });
  const now = new Date().toISOString();
  const { error } = await auth.service.from("messaging_channels").update({
    status: "opted_out",
    opted_out_at: now,
    paused_at: null,
    updated_at: now,
  }).eq("user_id", auth.userId).eq("provider", provider);
  if (error) return NextResponse.json({ error: "could not disconnect iMessage" }, { status: 503 });
  return NextResponse.json({ status: "opted_out" });
}
