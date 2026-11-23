import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { companyUgcAssetPath } from "@/lib/company-os/ugc-renderer";

export const runtime = "nodejs";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) return NextResponse.json({ error: "Google owner access required" }, { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid asset" }, { status: 400 });
  const action = await auth.service.from("company_actions")
    .select("id,action_type,status,result")
    .eq("id", id)
    .eq("action_type", "queue_ugc_video")
    .eq("status", "completed")
    .maybeSingle();
  if (action.error) return NextResponse.json({ error: "asset unavailable" }, { status: 503 });
  const storagePath = companyUgcAssetPath(action.data?.result, id);
  if (!storagePath) return NextResponse.json({ error: "asset not found" }, { status: 404 });
  const signed = await auth.service.storage.from("company-content").createSignedUrl(storagePath, 120, { download: `badger-ai-${id.slice(0, 8)}.mp4` });
  if (signed.error || !signed.data?.signedUrl) return NextResponse.json({ error: "asset unavailable" }, { status: 503 });
  try {
    const target = new URL(signed.data.signedUrl);
    const expected = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (target.protocol !== "https:" || target.host !== expected.host || !target.pathname.includes("/storage/v1/object/sign/company-content/")) throw new Error("invalid_signed_asset");
    return NextResponse.redirect(target, 302);
  } catch {
    return NextResponse.json({ error: "asset unavailable" }, { status: 503 });
  }
}
