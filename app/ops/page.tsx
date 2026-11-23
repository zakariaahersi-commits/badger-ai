"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authJsonHeaders, supabase } from "@/lib/cloud";
import { useSession } from "@/lib/sync";
import { TESTER_FEEDBACK_TAGS, TESTER_STATUSES, type TesterFeedbackTag, type TesterStatus } from "@/lib/tester-control";

type OpsUser = {
  userId: string; email: string; name: string; joinedAt: string; emailConfirmedAt: string | null;
  lastActiveAt: string | null; paidStatus: string; day: number | null; daysRemaining: number | null;
  paidAt: string | null; tasksCompleted: number; coachMessages: number; tokens: number; aiCostUsd: number; lastEvent: string | null;
  checkoutRecoveryStatus: string; checkoutStartedAt: string | null; checkoutReminders: number; emailsSent: number; emailsTracked: number; emailsDelivered: number; emailsOpened: number; emailsClicked: number; lastEmailAt: string | null;
};
type TesterTimelineItem = { kind: "event" | "delivery" | "bug"; label: string; createdAt: string; path: string | null; status: string | null; detail: string | null; release: string | null };
type TesterAccount = OpsUser & {
  cohort: string; testerStatus: TesterStatus; feedbackTags: TesterFeedbackTag[]; ownerNotes: string; invitedAt: string; testerUpdatedAt: string;
  journey: { complete: number; total: number; current: number; label: string; steps: Array<{ label: string; complete: boolean }> };
  attention: Array<{ code: string; severity: "medium" | "high"; label: string; detail: string }>;
  timeline: TesterTimelineItem[];
};
type OpsData = {
  generatedAt: string;
  windowDays: number;
  kpis: Record<string, number>;
  funnel: Record<string, number>;
  onboardingSteps: Record<string, number>;
  daily: Array<{ date: string; events: number; activeUsers: number; tasks: number; coachMessages: number; tokens: number; costUsd: number }>;
  aiByFeature: Record<string, { calls: number; tokens: number; costUsd: number; failures: number; avgLatencyMs: number }>;
  users: OpsUser[];
  testers: TesterAccount[];
  bugs: Array<{ id: string; user_id: string; category: string; severity: string; status: string; summary: string; details: string; path: string | null; created_at: string }>;
  recentEvents: Array<{ user_id: string | null; event_name: string; path: string | null; properties: Record<string, unknown>; created_at: string }>;
  deliveries: Array<{ user_id: string; channel: string; status: string; error_code: string | null; created_at: string }>;
  release: string;
};
type Tab = "overview" | "testers" | "users" | "emails" | "ai" | "bugs";

const KPI: Array<{ key: string; label: string; format?: "usd" | "number" }> = [
  { key: "users", label: "Total users" },
  { key: "activeUsers7d", label: "Active, 7 days" },
  { key: "newUsers7d", label: "New, 7 days" },
  { key: "paidAccess", label: "Paying users" },
  { key: "netRevenueUsd", label: "Net revenue", format: "usd" },
  { key: "tasksCompleted30d", label: "Tasks completed" },
  { key: "coachMessages30d", label: "Messages to Bo" },
  { key: "aiCostUsd30d", label: "AI cost, 30 days", format: "usd" },
];
const FUNNEL_LABELS: Record<string, string> = {
  pageViews: "Landing views", onboardingStarted: "Started onboarding", onboardingCompleted: "Finished onboarding",
  demoStarted: "Tried the live demo", demoCompleted: "Received a Bo brief", demoCtaClicked: "Continued from demo",
  accountCreated: "Created account", checkoutStarted: "Started checkout", checkoutCompleted: "Paid",
  journeyRecoveryEmails: "Journey-ready recovery emails",
  checkoutRecoveryEmails: "Checkout recovery emails",
  checkoutFailed: "Checkout errors", taskCompleted: "Tasks completed", coachMessages: "Messages to Bo",
};

function integer(value: number): string { return new Intl.NumberFormat("en").format(Math.round(value || 0)); }
function usd(value: number): string {
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value || 0);
}
function when(value: string | null): string {
  if (!value) return "Never";
  const delta = Date.now() - Date.parse(value);
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function words(value: string): string { return value.replaceAll("_", " "); }

export default function OpsPage() {
  const { session, ready } = useSession();
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");

  const signInWithGoogle = useCallback(async () => {
    const sb = supabase();
    if (!sb || loading) return;
    setLoading(true);
    setError("");
    const { error: signInError } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/ops`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  }, [loading]);

  const signOut = useCallback(async () => {
    const sb = supabase();
    setLoading(true);
    await sb?.auth.signOut({ scope: "local" });
    setData(null);
    setError("");
    setLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    const response = await fetch("/api/ops/summary", { headers: await authJsonHeaders(), cache: "no-store" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error || "Dashboard unavailable");
      setLoading(false);
      return;
    }
    setData(await response.json());
    setLoading(false);
  }, [session]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const users = useMemo(() => {
    const query = search.trim().toLowerCase();
    return !query ? data?.users ?? [] : (data?.users ?? []).filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query));
  }, [data, search]);

  if (!ready) return <main className="min-h-dvh bg-peach p-8 text-ink">Loading…</main>;
  if (!session) return <main className="grid min-h-dvh place-items-center bg-peach p-6 text-ink"><div className="w-full max-w-sm rounded-[24px] bg-paper p-6 text-center shadow-card"><div className="text-[11px] font-bold tracking-[1.2px] text-indigo">BADGER AI OPS · PRIVATE</div><h1 className="mt-3 text-[30px] font-extrabold tracking-[-1px]">Owner access only.</h1><p className="mt-2 text-[14px] leading-[1.5] text-ink-60">Use the Google account approved for Badger AI administration.</p>{error && <p className="mt-3 text-[13px] font-semibold text-bred">{error}</p>}<button type="button" onClick={() => void signInWithGoogle()} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-ink-10 bg-white px-5 py-4 font-bold text-ink shadow-card disabled:opacity-50"><GoogleMark />{loading ? "Opening Google…" : "Continue with Google"}</button></div></main>;
  if (error) return <main className="grid min-h-dvh place-items-center bg-peach p-6 text-ink"><div className="w-full max-w-sm rounded-[24px] bg-paper p-6 text-center shadow-card"><div className="text-[11px] font-bold tracking-[1.2px] text-indigo">BADGER AI OPS · PRIVATE</div><h1 className="mt-3 text-[24px] font-extrabold">This account is not an admin.</h1><p className="mt-2 text-[14px] leading-[1.5] text-ink-60">Only the approved Google owner account can open this page.</p><button type="button" onClick={() => void signOut()} disabled={loading} className="mt-5 w-full rounded-xl border-none bg-ink px-5 py-3 font-bold text-cream disabled:opacity-50">Use another Google account</button></div></main>;
  if (!data) return <main className="min-h-dvh bg-peach p-8 text-ink">Building your dashboard…</main>;

  const maxEvents = Math.max(1, ...data.daily.map((day) => day.events));
  const maxTokens = Math.max(1, ...data.daily.map((day) => day.tokens));
  const maxFunnel = Math.max(1, ...Object.values(data.funnel));
  const alerts = [
    data.kpis.openBugs > 0 ? `${integer(data.kpis.openBugs)} open bug reports` : null,
    data.kpis.aiFailures30d > 0 ? `${integer(data.kpis.aiFailures30d)} failed AI calls` : null,
    data.kpis.failedDeliveries > 0 ? `${integer(data.kpis.failedDeliveries)} failed messages` : null,
    data.kpis.stuckWakes > 0 ? `${integer(data.kpis.stuckWakes)} stuck reminders` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-dvh bg-[#F6F1E8] px-3 py-4 text-ink sm:px-6 sm:py-6 lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1240px]">
        <header className="flex flex-col gap-4 border-b border-ink-10 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl"><div className="text-[10px] font-extrabold tracking-[1.4px] text-indigo sm:text-[11px]">BADGER AI · OWNER ONLY</div><h1 className="mt-1 text-[30px] font-extrabold leading-[1.02] tracking-[-1.2px] sm:text-[38px] lg:text-[46px]">Company control room.</h1><p className="mt-2 text-[12px] leading-[1.45] text-ink-60 sm:text-[13px]">Users, behaviour, revenue, AI spend, delivery and problems. <span className="block font-mono text-[9px] text-ink-40 sm:inline sm:text-[10px]">Release {data.release}</span></p></div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end"><div className="order-last w-full text-left text-[9px] leading-[1.35] text-ink-40 sm:order-none sm:mr-1 sm:w-auto sm:text-right sm:text-[10px]">Updated<br className="hidden sm:block" /> {new Date(data.generatedAt).toLocaleString()}</div><Link href="/ops/company" className="min-h-11 flex-1 rounded-xl bg-indigo px-4 py-3 text-center text-[12px] font-bold text-white shadow-card sm:flex-none">Company OS</Link><button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 flex-1 rounded-xl border border-ink-10 bg-paper px-4 py-3 text-[12px] font-bold shadow-card disabled:opacity-50 sm:flex-none">{loading ? "Refreshing…" : "Refresh"}</button><button type="button" onClick={() => void signOut()} disabled={loading} className="min-h-11 flex-1 rounded-xl border border-ink-10 bg-transparent px-4 py-3 text-[12px] font-bold text-ink-60 disabled:opacity-50 sm:flex-none">Sign out</button></div>
        </header>

        <nav className="-mx-3 mt-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" aria-label="Operations sections">
          {(["overview", "testers", "users", "emails", "ai", "bugs"] as Tab[]).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`min-h-11 whitespace-nowrap rounded-full border px-3 py-2.5 text-[11px] font-bold capitalize sm:px-4 sm:text-[12px] ${tab === item ? "border-ink bg-ink text-cream" : "border-ink-10 bg-paper text-ink-60"}`}>{item}{item === "testers" ? ` · ${data.testers.length}${data.kpis.testersNeedingAttention ? ` (${data.kpis.testersNeedingAttention})` : ""}` : item === "users" ? ` · ${data.users.length}` : item === "emails" ? ` · ${data.kpis.emailsTracked30d}` : item === "bugs" && data.kpis.openBugs ? ` · ${data.kpis.openBugs}` : ""}</button>)}
        </nav>

        {tab === "overview" && <>
          <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {KPI.map((item) => <div key={item.key} className="rounded-[20px] bg-paper p-4 shadow-card"><div className="text-[10px] font-bold uppercase tracking-[.8px] text-ink-40">{item.label}</div><div className="badger-number mt-2 text-[28px] font-extrabold tracking-[-1px]">{item.format === "usd" ? usd(data.kpis[item.key]) : integer(data.kpis[item.key])}</div></div>)}
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <section className="rounded-[24px] bg-ink p-5 text-cream shadow-card">
              <div className="flex items-end justify-between"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-yellow">ACTIVITY · 30 DAYS</div><div className="mt-1 text-[12px] text-white/55">Every meaningful action inside Badger AI</div></div><strong className="text-[22px]">{integer(data.daily.reduce((sum, day) => sum + day.events, 0))}</strong></div>
              <div className="mt-6 flex h-32 items-end gap-1" aria-label="Daily activity chart">{data.daily.map((day) => <div key={day.date} title={`${day.date}: ${day.events} events`} className="min-w-0 flex-1 rounded-t bg-yellow/90" style={{ height: `${Math.max(day.events ? 8 : 2, day.events / maxEvents * 100)}%` }} />)}</div>
              <div className="mt-2 flex justify-between text-[9px] text-white/35"><span>30 days ago</span><span>Today</span></div>
            </section>
            <section className={`rounded-[24px] p-5 shadow-card ${alerts.length ? "bg-[#FFE2DC]" : "bg-[#DFF5E8]"}`}>
              <div className="text-[10px] font-extrabold tracking-[1.1px] text-ink-60">SYSTEM HEALTH</div><div className="mt-2 text-[28px] font-extrabold tracking-[-1px]">{alerts.length ? `${alerts.length} things need you` : "Everything looks healthy"}</div>
              <div className="mt-4 space-y-2">{alerts.length ? alerts.map((alert) => <div key={alert} className="rounded-xl bg-paper/70 px-3 py-2.5 text-[12px] font-bold">{alert}</div>) : <p className="text-[13px] leading-[1.5] text-ink-60">No open reports, failed messages, AI failures or stuck reminders in this view.</p>}</div>
            </section>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <section className="rounded-[24px] bg-paper p-5 shadow-card"><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">30-DAY FUNNEL</div><div className="mt-4 space-y-3">{Object.entries(data.funnel).map(([key, value]) => <div key={key}><div className="flex justify-between text-[12px]"><span className="text-ink-60">{FUNNEL_LABELS[key] || words(key)}</span><strong>{integer(value)}</strong></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream"><div className="h-full rounded-full bg-indigo" style={{ width: `${Math.max(value ? 4 : 0, value / maxFunnel * 100)}%` }} /></div></div>)}</div></section>
            <section className="rounded-[24px] bg-paper p-5 shadow-card"><div className="flex justify-between"><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">RECENT ACTIVITY</div><button type="button" onClick={() => setTab("users")} className="border-none bg-transparent text-[11px] font-bold text-indigo">View users</button></div><div className="mt-3 max-h-[370px] space-y-2 overflow-auto">{data.recentEvents.slice(0, 20).map((event, index) => { const user = data.users.find((item) => item.userId === event.user_id); return <div key={`${event.created_at}-${index}`} className="flex items-center justify-between gap-3 rounded-xl bg-cream px-3 py-2.5"><div className="min-w-0"><div className="truncate text-[12px] font-bold">{words(event.event_name)}</div><div className="truncate text-[10px] text-ink-40">{user?.name || user?.email || "Visitor"}</div></div><span className="shrink-0 text-[10px] text-ink-40">{when(event.created_at)}</span></div>; })}</div></section>
          </div>
        </>}

        {tab === "testers" && <TesterControlRoom data={data} reload={load} />}

        {tab === "users" && <section className="mt-5 rounded-[24px] bg-paper p-4 shadow-card sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">USERS</div><h2 className="mt-1 text-[23px] font-extrabold tracking-[-.6px] sm:text-[25px]">Every founder in one place.</h2></div><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="min-h-11 w-full rounded-xl border border-ink-10 bg-cream px-4 py-3 text-[13px] outline-none focus:border-ink sm:w-72" /></div>
          <div className="mt-4 grid gap-3 lg:hidden">{users.map((user) => <article key={user.userId} className="rounded-[18px] bg-cream p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[13px] font-bold">{user.name || "No name yet"}</div><div className="truncate text-[10px] text-ink-40">{user.email}</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold uppercase ${user.paidStatus === "active" ? "bg-[#DFF5E8] text-teal-deep" : user.paidStatus === "refunded" ? "bg-[#FFE2DC] text-bred" : "bg-paper text-ink-40"}`}>{user.paidStatus}</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-[10px]"><UserFact label="Journey" value={user.day ? `Day ${user.day} · ${user.daysRemaining} left` : "Not started"} /><UserFact label="Last active" value={when(user.lastActiveAt)} /><UserFact label="Tasks" value={integer(user.tasksCompleted)} /><UserFact label="Bo chats" value={integer(user.coachMessages)} /><UserFact label="Emails" value={user.emailsTracked ? `${user.emailsSent} sent · ${user.emailsOpened} opened · ${user.emailsClicked} clicked` : user.emailsSent ? `${user.emailsSent} sent · engagement unknown` : "None sent"} /><UserFact label="AI cost" value={usd(user.aiCostUsd)} /></div></article>)}{!users.length && <div className="py-10 text-center text-[13px] text-ink-40">No users match that search.</div>}</div>
          <div className="mt-4 hidden overflow-x-auto lg:block"><table className="w-full min-w-[900px] border-collapse text-left"><thead><tr className="border-b border-ink-10 text-[9px] uppercase tracking-[.8px] text-ink-40"><th className="px-2 py-3">Founder</th><th className="px-2 py-3">Access</th><th className="px-2 py-3">Journey</th><th className="px-2 py-3">Last active</th><th className="px-2 py-3">Tasks</th><th className="px-2 py-3">Bo chats</th><th className="px-2 py-3">AI tokens</th><th className="px-2 py-3">AI cost</th></tr></thead><tbody>{users.map((user) => <tr key={user.userId} className="border-b border-ink-10 last:border-0"><td className="px-2 py-3"><div className="text-[12px] font-bold">{user.name || "No name yet"}</div><div className="text-[10px] text-ink-40">{user.email}</div></td><td className="px-2 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${user.paidStatus === "active" ? "bg-[#DFF5E8] text-teal-deep" : user.paidStatus === "refunded" ? "bg-[#FFE2DC] text-bred" : "bg-cream text-ink-40"}`}>{user.paidStatus}</span></td><td className="px-2 py-3 text-[11px] font-bold">{user.day ? `Day ${user.day} · ${user.daysRemaining} left` : "Not started"}</td><td className="px-2 py-3 text-[11px]">{when(user.lastActiveAt)}</td><td className="px-2 py-3 text-[11px] font-bold">{user.tasksCompleted}</td><td className="px-2 py-3 text-[11px] font-bold">{user.coachMessages}</td><td className="px-2 py-3 text-[11px]">{integer(user.tokens)}</td><td className="px-2 py-3 text-[11px]">{usd(user.aiCostUsd)}</td></tr>)}</tbody></table>{!users.length && <div className="py-10 text-center text-[13px] text-ink-40">No users match that search.</div>}</div>
        </section>}

        {tab === "emails" && <section className="mt-5 rounded-[24px] bg-paper p-4 shadow-card sm:p-5"><div className="flex items-end justify-between gap-3"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">EMAIL ENGAGEMENT · 30 DAYS</div><h2 className="mt-1 text-[25px] font-extrabold tracking-[-.6px]">What each founder actually received.</h2></div><div className="text-right text-[10px] text-ink-40">A dash means the email predates tracking.<br />Opens can be inflated; clicks are stronger.</div></div><div className="mt-4 grid grid-cols-3 gap-3"><Metric label="Tracked emails" value={integer(data.kpis.emailsTracked30d)} /><Metric label="Opened" value={integer(data.kpis.emailsOpened30d)} /><Metric label="Clicked" value={integer(data.kpis.emailsClicked30d)} /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] border-collapse text-left"><thead><tr className="border-b border-ink-10 text-[9px] uppercase tracking-[.8px] text-ink-40"><th className="px-2 py-3">Founder</th><th>Sent</th><th>Tracked</th><th>Delivered</th><th>Opened</th><th>Clicked</th><th>Last tracked event</th></tr></thead><tbody>{data.users.map((user) => { const known = user.emailsTracked > 0; return <tr key={user.userId} className="border-b border-ink-10 last:border-0"><td className="px-2 py-3"><div className="text-[12px] font-bold">{user.name || "No name yet"}</div><div className="text-[10px] text-ink-40">{user.email}</div></td><td className="font-bold">{user.emailsSent}</td><td>{user.emailsTracked}</td><td>{known ? user.emailsDelivered : "—"}</td><td>{known ? user.emailsOpened : "—"}</td><td className={user.emailsClicked ? "font-bold text-teal-deep" : ""}>{known ? user.emailsClicked : "—"}</td><td className="text-[11px]">{known ? when(user.lastEmailAt) : "Untracked"}</td></tr>; })}</tbody></table></div></section>}

        {tab === "ai" && <><section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="AI calls" value={integer(Object.values(data.aiByFeature).reduce((sum, item) => sum + item.calls, 0))} /><Metric label="Tokens · 30 days" value={integer(data.kpis.aiTokens30d)} /><Metric label="Estimated cost" value={usd(data.kpis.aiCostUsd30d)} /><Metric label="Failed calls" value={integer(data.kpis.aiFailures30d)} alert={data.kpis.aiFailures30d > 0} /></section>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]"><section className="rounded-[24px] bg-paper p-4 shadow-card sm:p-5"><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">COST BY AI FEATURE</div><div className="mt-3 grid gap-2 lg:hidden">{Object.entries(data.aiByFeature).sort(([, left], [, right]) => right.costUsd - left.costUsd).map(([feature, item]) => <article key={feature} className="rounded-[14px] bg-cream p-3"><div className="flex items-start justify-between gap-3"><strong className="text-[12px]">{words(feature)}</strong><span className="text-[11px] font-bold">{usd(item.costUsd)}</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-ink-40"><span>{integer(item.calls)} calls</span><span>{integer(item.tokens)} tokens</span><span>{item.avgLatencyMs < 1000 ? `${item.avgLatencyMs}ms` : `${(item.avgLatencyMs / 1000).toFixed(1)}s`} average</span><span className={item.failures ? "font-bold text-bred" : ""}>{item.failures} failures</span></div></article>)}</div><div className="mt-3 hidden overflow-x-auto lg:block"><table className="w-full min-w-[520px] text-left"><thead><tr className="text-[9px] uppercase tracking-[.7px] text-ink-40"><th className="py-2">Feature</th><th>Calls</th><th>Tokens</th><th>Average</th><th>Failures</th><th>Cost</th></tr></thead><tbody>{Object.entries(data.aiByFeature).sort(([, left], [, right]) => right.costUsd - left.costUsd).map(([feature, item]) => <tr key={feature} className="border-t border-ink-10 text-[11px]"><td className="py-3 font-bold">{words(feature)}</td><td>{integer(item.calls)}</td><td>{integer(item.tokens)}</td><td>{item.avgLatencyMs < 1000 ? `${item.avgLatencyMs}ms` : `${(item.avgLatencyMs / 1000).toFixed(1)}s`}</td><td>{item.failures}</td><td>{usd(item.costUsd)}</td></tr>)}</tbody></table></div></section>
          <section className="rounded-[24px] bg-ink p-5 text-cream shadow-card"><div className="text-[10px] font-extrabold tracking-[1.1px] text-yellow">TOKENS · 30 DAYS</div><div className="mt-6 flex h-48 items-end gap-1">{data.daily.map((day) => <div key={day.date} title={`${day.date}: ${integer(day.tokens)} tokens`} className="min-w-0 flex-1 rounded-t bg-indigo" style={{ height: `${Math.max(day.tokens ? 8 : 2, day.tokens / maxTokens * 100)}%` }} />)}</div><p className="mt-4 text-[11px] leading-[1.5] text-white/50">Cost is estimated from provider token and audio rates. It excludes Vercel, Supabase, Resend and Stripe fees.</p></section></div>
        </>}

        {tab === "bugs" && <section className="mt-5 rounded-[24px] bg-paper p-5 shadow-card"><div className="flex items-end justify-between"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">BUGS AND FEEDBACK</div><h2 className="mt-1 text-[25px] font-extrabold tracking-[-.6px]">What users need fixed.</h2></div><span className="text-[11px] text-ink-40">Newest first</span></div><div className="mt-4 grid gap-3 lg:grid-cols-2">{data.bugs.length ? data.bugs.map((bug) => { const user = data.users.find((item) => item.userId === bug.user_id); return <article key={bug.id} className={`rounded-[18px] border p-4 ${bug.status === "resolved" || bug.status === "closed" ? "border-ink-10 bg-cream/50" : bug.severity === "blocking" || bug.severity === "high" ? "border-bred/30 bg-[#FFE2DC]" : "border-ink-10 bg-cream"}`}><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-[.7px] text-ink-40">{bug.category} · {bug.severity} · {bug.status}</span><span className="text-[9px] text-ink-40">{when(bug.created_at)}</span></div><h3 className="mt-2 text-[15px] font-bold">{bug.summary}</h3><p className="mt-1 text-[12px] leading-[1.45] text-ink-60">{bug.details}</p><div className="mt-3 flex justify-between text-[9px] text-ink-40"><span>{user?.name || user?.email || "Unknown user"}</span><span className="font-mono">{bug.path || ""}</span></div></article>; }) : <div className="rounded-xl bg-[#DFF5E8] p-5 text-[13px] text-teal-deep">No reports yet.</div>}</div></section>}
      </div>
    </main>
  );
}

function TesterControlRoom({ data, reload }: { data: OpsData; reload: () => Promise<void> }) {
  const initial = data.testers[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initial?.userId ?? null);
  const [cohort, setCohort] = useState(initial?.cohort ?? "");
  const [status, setStatus] = useState<TesterStatus>(initial?.testerStatus ?? "active");
  const [tags, setTags] = useState<TesterFeedbackTag[]>(initial?.feedbackTags ?? []);
  const [notes, setNotes] = useState(initial?.ownerNotes ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = data.testers.find((tester) => tester.userId === selectedId) ?? null;
  const testerIds = useMemo(() => new Set(data.testers.map((tester) => tester.userId)), [data.testers]);
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.users.filter((user) => !testerIds.has(user.userId) && (!needle || `${user.name} ${user.email}`.toLowerCase().includes(needle))).slice(0, 12);
  }, [data.users, query, testerIds]);

  function chooseTester(tester: TesterAccount) {
    setSelectedId(tester.userId);
    setCohort(tester.cohort);
    setStatus(tester.testerStatus);
    setTags(tester.feedbackTags);
    setNotes(tester.ownerNotes);
    setMessage("");
  }

  async function writeTester(userId: string, values: { cohort: string; status: TesterStatus; feedbackTags: TesterFeedbackTag[]; ownerNotes: string }) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/ops/testers", {
      method: "POST",
      headers: await authJsonHeaders(),
      body: JSON.stringify({ userId, ...values }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Tester update failed");
      setBusy(false);
      return false;
    }
    await reload();
    setBusy(false);
    setMessage("Saved");
    return true;
  }

  async function addTester(userId: string) {
    const saved = await writeTester(userId, { cohort: "private-beta-2026-08", status: "active", feedbackTags: [], ownerNotes: "" });
    if (saved) {
      setSelectedId(userId);
      setCohort("private-beta-2026-08");
      setStatus("active");
      setTags([]);
      setNotes("");
    }
  }

  async function removeTester() {
    if (!selected || !window.confirm(`Remove ${selected.email} from the tester cohort? Their account and product data will not be deleted.`)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/ops/testers?userId=${encodeURIComponent(selected.userId)}`, { method: "DELETE", headers: await authJsonHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(payload.error || "Tester update failed");
      setBusy(false);
      return;
    }
    setSelectedId(null);
    await reload();
    setBusy(false);
  }

  function toggleTag(tag: TesterFeedbackTag) {
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  const activeTesters = data.testers.filter((tester) => tester.testerStatus === "active").length;
  const completedFirstTask = data.testers.filter((tester) => tester.journey.complete === tester.journey.total).length;
  const attentionCount = data.testers.filter((tester) => tester.attention.length > 0).length;

  return <div className="mt-5 space-y-5">
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Metric label="Active testers" value={integer(activeTesters)} />
      <Metric label="First task done" value={`${completedFirstTask}/${data.testers.length || 0}`} />
      <Metric label="Need attention" value={integer(attentionCount)} alert={attentionCount > 0} />
    </section>

    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-[24px] bg-paper p-4 shadow-card">
          <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">TEST COHORT</div>
          <h2 className="mt-1 text-[25px] font-extrabold tracking-[-.6px]">Ten people. Every signal.</h2>
          <div className="-mr-4 mt-4 flex gap-2 overflow-x-auto pb-1 pr-4 lg:mr-0 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0 lg:pr-0">
            {data.testers.map((tester) => <button key={tester.userId} type="button" onClick={() => chooseTester(tester)} className={`w-full min-w-[250px] rounded-[16px] border p-3 text-left lg:min-w-0 ${selectedId === tester.userId ? "border-ink bg-ink text-cream" : "border-ink-10 bg-cream text-ink"}`}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-[13px] font-bold">{tester.name || tester.email}</div><div className={`truncate text-[10px] ${selectedId === tester.userId ? "text-white/50" : "text-ink-40"}`}>{tester.email}</div></div>{tester.attention.length > 0 && <span className="rounded-full bg-[#FFE2DC] px-2 py-1 text-[9px] font-bold text-bred">{tester.attention.length}</span>}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-yellow" style={{ width: `${tester.journey.complete / tester.journey.total * 100}%` }} /></div>
              <div className={`mt-1.5 flex justify-between text-[9px] ${selectedId === tester.userId ? "text-white/45" : "text-ink-40"}`}><span>{tester.journey.label}</span><span>{tester.journey.complete}/{tester.journey.total}</span></div>
            </button>)}
            {!data.testers.length && <p className="rounded-xl bg-cream p-4 text-[12px] leading-[1.5] text-ink-60">No accounts are marked as testers yet. Add the ten invited accounts below.</p>}
          </div>
        </section>

        <section className="rounded-[24px] bg-paper p-4 shadow-card">
          <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">ADD TESTER</div>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search an account" className="mt-3 w-full rounded-xl border border-ink-10 bg-cream px-3 py-3 text-[12px] outline-none focus:border-ink" />
          <div className="mt-2 max-h-64 space-y-1.5 overflow-auto">{candidates.map((user) => <div key={user.userId} className="flex items-center justify-between gap-2 rounded-xl bg-cream p-2.5"><div className="min-w-0"><div className="truncate text-[11px] font-bold">{user.name || "No name"}</div><div className="truncate text-[9px] text-ink-40">{user.email}</div></div><button type="button" disabled={busy} onClick={() => void addTester(user.userId)} className="shrink-0 rounded-lg border-none bg-ink px-2.5 py-2 text-[9px] font-bold text-cream disabled:opacity-40">Add</button></div>)}</div>
        </section>
      </aside>

      <section className="min-w-0 rounded-[24px] bg-paper p-4 shadow-card sm:p-5">
        {!selected ? <div className="grid min-h-80 place-items-center text-center"><div><div className="text-[11px] font-bold tracking-[1px] text-indigo">TESTER DETAIL</div><p className="mt-2 text-[14px] text-ink-60">Select or add a tester to open their journey.</p></div></div> : <>
          <div className="flex flex-col gap-3 border-b border-ink-10 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">TESTER DETAIL</div><h2 className="mt-1 text-[27px] font-extrabold tracking-[-.7px]">{selected.name || "Unnamed founder"}</h2><p className="text-[11px] text-ink-40">{selected.email} · joined {new Date(selected.joinedAt).toLocaleDateString()}</p></div>
            <div className="flex gap-2"><span className={`rounded-full px-3 py-2 text-[9px] font-bold uppercase ${selected.paidStatus === "active" ? "bg-[#DFF5E8] text-teal-deep" : "bg-cream text-ink-40"}`}>{selected.paidStatus} access</span><span className="rounded-full bg-cream px-3 py-2 text-[9px] font-bold uppercase">{selected.day ? `Day ${selected.day}` : "Not started"}</span></div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">{selected.journey.steps.map((step, index) => <div key={step.label} className={`rounded-[14px] border p-3 ${step.complete ? "border-teal/20 bg-[#DFF5E8]" : index === selected.journey.current ? "border-yellow-deep bg-[#FFF7C7]" : "border-ink-10 bg-cream"}`}><div className="text-[9px] font-bold text-ink-40">0{index + 1}</div><div className="mt-1 text-[11px] font-bold">{step.label}</div></div>)}</div>

          <div className={`mt-4 rounded-[18px] p-4 ${selected.attention.length ? "bg-[#FFE2DC]" : "bg-[#DFF5E8]"}`}><div className="text-[10px] font-extrabold tracking-[1px] text-ink-60">NEEDS ATTENTION</div>{selected.attention.length ? <div className="mt-2 space-y-2">{selected.attention.map((alert) => <div key={alert.code} className="rounded-xl bg-paper/75 p-3"><div className="flex justify-between gap-2"><strong className="text-[12px]">{alert.label}</strong><span className={`text-[9px] font-bold uppercase ${alert.severity === "high" ? "text-bred" : "text-ink-40"}`}>{alert.severity}</span></div><p className="mt-1 text-[10px] leading-[1.4] text-ink-60">{alert.detail}</p></div>)}</div> : <p className="mt-2 text-[12px] text-teal-deep">No intervention needed right now.</p>}</div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-bold text-ink-60">COHORT<input value={cohort} onChange={(event) => setCohort(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 80))} className="mt-1.5 w-full rounded-xl border border-ink-10 bg-cream px-3 py-3 text-[12px] text-ink outline-none focus:border-ink" /></label>
            <label className="text-[10px] font-bold text-ink-60">STATUS<select value={status} onChange={(event) => setStatus(event.target.value as TesterStatus)} className="mt-1.5 w-full rounded-xl border border-ink-10 bg-cream px-3 py-3 text-[12px] text-ink outline-none focus:border-ink">{TESTER_STATUSES.map((item) => <option key={item} value={item}>{words(item)}</option>)}</select></label>
          </div>
          <div className="mt-4"><div className="text-[10px] font-bold text-ink-60">FEEDBACK TAGS</div><div className="mt-2 flex flex-wrap gap-2">{TESTER_FEEDBACK_TAGS.map((tag) => <button key={tag} type="button" onClick={() => toggleTag(tag)} className={`rounded-full border px-3 py-2 text-[9px] font-bold ${tags.includes(tag) ? "border-ink bg-ink text-cream" : "border-ink-10 bg-cream text-ink-60"}`}>{words(tag)}</button>)}</div></div>
          <label className="mt-4 block text-[10px] font-bold text-ink-60">OWNER NOTES<textarea value={notes} onChange={(event) => setNotes(event.target.value.slice(0, 3000))} rows={4} placeholder="What did they struggle with? What should we follow up on?" className="mt-1.5 w-full resize-y rounded-xl border border-ink-10 bg-cream px-3 py-3 text-[12px] leading-[1.5] text-ink outline-none focus:border-ink" /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy || !cohort} onClick={() => void writeTester(selected.userId, { cohort, status, feedbackTags: tags, ownerNotes: notes })} className="rounded-xl border-none bg-ink px-5 py-3 text-[11px] font-bold text-cream disabled:opacity-40">{busy ? "Saving…" : "Save tester"}</button><button type="button" disabled={busy} onClick={() => void removeTester()} className="rounded-xl border border-ink-10 bg-transparent px-4 py-3 text-[11px] font-bold text-ink-40 disabled:opacity-40">Remove from cohort</button>{message && <span className={`text-[10px] font-bold ${message === "Saved" ? "text-teal-deep" : "text-bred"}`}>{message}</span>}</div>

          <div className="mt-6 border-t border-ink-10 pt-5"><div className="flex items-end justify-between"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">TIMELINE</div><h3 className="mt-1 text-[20px] font-extrabold">What happened, in order.</h3></div><span className="text-[9px] text-ink-40">Newest first</span></div><div className="mt-3 max-h-[540px] space-y-2 overflow-auto">{selected.timeline.map((item, index) => <div key={`${item.createdAt}-${item.kind}-${index}`} className={`rounded-[14px] border p-3 ${item.kind === "bug" ? "border-bred/20 bg-[#FFE2DC]" : item.status === "failed" ? "border-bred/20 bg-[#FFE2DC]" : "border-ink-10 bg-cream"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate text-[11px] font-bold">{item.kind === "event" ? words(item.label) : item.label}</div><div className="mt-1 flex flex-wrap gap-x-2 text-[9px] text-ink-40"><span>{item.kind}</span>{item.path && <span className="font-mono">{item.path}</span>}{item.status && <span>{item.status}</span>}{item.detail && <span>{item.detail}</span>}{item.release && <span className="font-mono">release {item.release}</span>}</div></div><time className="shrink-0 text-[9px] text-ink-40" dateTime={item.createdAt}>{when(item.createdAt)}</time></div></div>)}{!selected.timeline.length && <p className="rounded-xl bg-cream p-4 text-[12px] text-ink-60">No product activity recorded in the last 30 days.</p>}</div></div>
        </>}
      </section>
    </div>
  </div>;
}

function Metric({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className={`rounded-[20px] p-4 shadow-card ${alert ? "bg-[#FFE2DC]" : "bg-paper"}`}><div className="text-[10px] font-bold uppercase tracking-[.8px] text-ink-40">{label}</div><div className="badger-number mt-2 text-[28px] font-extrabold tracking-[-1px]">{value}</div></div>;
}

function UserFact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><div className="text-[8px] font-bold uppercase tracking-[.7px] text-ink-40">{label}</div><div className="mt-1 truncate text-[11px] font-bold text-ink">{value}</div></div>;
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1A10 10 0 0 0 2 12c0 1.7.4 3.2 1.1 4.6L6.5 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 5.9Z"/></svg>;
}
