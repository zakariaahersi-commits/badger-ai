import { NextRequest, NextResponse } from "next/server";
import { serverAuth } from "@/lib/server-auth";
import { isGoogleOAuthSession, isOwnerEmail } from "@/lib/ops-auth";
import { CompanyDecisionError, decideCompanyAction } from "@/lib/company-os/decisions";
import { executeCompanyAction } from "@/lib/company-os/executor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!isGoogleOAuthSession(auth.authMethods, auth.identityProviders) || !isOwnerEmail(auth.email)) return NextResponse.json({ error: "Google owner access required" }, { status: 403 });
  const { id } = await context.params;
  const body = await req.json().catch(() => null) as { decision?: string } | null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "reject"].includes(body?.decision ?? "")) return NextResponse.json({ error: "invalid decision" }, { status: 400 });
  try {
    const result = await decideCompanyAction({ service: auth.service, actionId: id, decision: body!.decision as "approve" | "reject", actorId: auth.userId, ownerUserId: auth.userId, channel: "web" });
    const execution = body!.decision === "approve" && result.action.status === "approved"
      ? await executeCompanyAction(auth.service, result.action.id)
      : null;
    return NextResponse.json({
      ...result,
      executionStatus: execution?.status ?? result.action.status,
      execution: execution?.message ?? result.execution,
    });
  } catch (error) {
    if (error instanceof CompanyDecisionError) {
      if (error.code === "connector_missing") return NextResponse.json({ error: "Configure this action's connector before approving it" }, { status: 409 });
      if (error.code === "not_found" || error.code === "not_pending") return NextResponse.json({ error: "Action is no longer pending" }, { status: 409 });
    }
    return NextResponse.json({ error: "Decision failed" }, { status: 503 });
  }
}
