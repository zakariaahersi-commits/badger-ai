import { NextRequest, NextResponse } from "next/server";
import { matchOpportunities, OPPORTUNITY_CATALOG, type Opportunity } from "@/lib/opportunity-catalog";
import { rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

export const runtime = "nodejs";

function safeText(value: unknown, max = 600): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicOpportunity(opportunity: Opportunity) {
  return {
    id: opportunity.id,
    label: opportunity.label,
    detail: opportunity.detail,
    category: opportunity.category,
    signal: opportunity.signal,
    tags: opportunity.tags,
  };
}

export async function POST(req: NextRequest) {
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  if (!rateLimit(`opportunities:${auth.userId}`, 12, 300_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const context = [body.context, body.workStyle, body.edge]
    .map((value) => safeText(value))
    .filter(Boolean)
    .join(" ");
  const audience = safeText(body.audience);

  // Only Badger's manually rewritten catalogue is founder-facing. The larger
  // owner-supplied research import remains private until redistribution rights
  // are documented; it is never lightly paraphrased and returned by this API.
  return NextResponse.json({
    opportunities: matchOpportunities(context, audience).map(publicOpportunity),
    catalogueSize: OPPORTUNITY_CATALOG.length,
  });
}
