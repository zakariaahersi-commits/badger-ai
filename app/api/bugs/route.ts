import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { serverAuth } from "@/lib/server-auth";

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`bugs:${clientIp(req)}`, 10, 60_000)) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  const auth = await serverAuth(req);
  if (auth.invalid || !auth.userId || !auth.service) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const summary = clean(body?.summary, 180);
  const details = clean(body?.details, 3_000);
  if (!summary || !details) return NextResponse.json({ error: "summary and details required" }, { status: 400 });
  const category = ["bug", "confusing", "idea", "billing"].includes(body?.category) ? body.category : "bug";
  const severity = ["low", "medium", "high", "blocking"].includes(body?.severity) ? body.severity : "medium";
  const path = clean(body?.path, 300);
  const { data, error } = await auth.service.from("bug_reports").insert({
    user_id: auth.userId,
    category,
    severity,
    summary,
    details,
    path: path.startsWith("/") ? path : null,
    browser: clean(req.headers.get("user-agent"), 500),
  }).select("id").single();
  if (error) {
    console.error("[bugs] insert failed", error.code ?? "database_error");
    return NextResponse.json({ error: "report failed" }, { status: 503 });
  }
  return NextResponse.json({ reported: true, id: data.id }, { status: 201 });
}
