import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { configureOwnerTelegramWebhook, ownerTelegramWebhookInfo } from "@/lib/telegram";

async function owner(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) return NextResponse.json({ error: "Google owner access required" }, { status: 403 });
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await owner(req);
  return denied ?? NextResponse.json(await ownerTelegramWebhookInfo());
}

export async function POST(req: NextRequest) {
  const denied = await owner(req);
  if (denied) return denied;
  const result = await configureOwnerTelegramWebhook();
  return NextResponse.json(result, { status: result.configured ? 200 : 503 });
}
