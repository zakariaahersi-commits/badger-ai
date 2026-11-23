"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Pill } from "@/components/ui";
import { PwaInstallCard } from "@/components/pwa-install";
import { authJsonHeaders, supabase } from "@/lib/cloud";
import { useSession } from "@/lib/sync";
import { currentDayOf, useBygga } from "@/lib/store";
import { track } from "@/lib/telemetry";

type ProfileData = {
  profile: { name: string; email: string; avatar_path: string | null } | null;
  standingOrders: {
    timezone: string;
    quiet_start: string;
    quiet_end: string;
    max_daily_nudges: number;
    accountability_level: "gentle" | "direct" | "firm";
    email_enabled: boolean;
    push_enabled: boolean;
    instructions: string[];
  } | null;
  memories: Array<{ id: string; kind: string; content: string; confidence: number; status: string; created_at: string }>;
  evidence: Array<{ id: string; day_num: number | null; claim_type: string; source_type: string; status: string; claim_summary: string; source_url: string | null; verdict_note: string | null; created_at: string }>;
  brain: {
    brief: { known: Array<{ text: string; source: string; fresh: boolean }>; missing: string; nextMove: string };
    entities: Array<{ id: string; kind: string; name: string; summary: string; confidence: number; source_type: string; last_verified_at: string | null }>;
  };
};

type BillingData = {
  access: boolean;
  paid: boolean;
  status: "none" | "paid" | "refunded" | "revoked" | "disputed";
  startedAt: string | null;
};

const EMPTY: ProfileData = { profile: null, standingOrders: null, memories: [], evidence: [], brain: { brief: { known: [], missing: "", nextMove: "" }, entities: [] } };
const CHECK_IN_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function statusTone(status: string) {
  if (status === "verified") return { bg: "rgba(24,128,90,.13)", color: "#146C4E", label: "Verified" };
  if (status === "rejected") return { bg: "rgba(185,52,52,.12)", color: "#9B2C2C", label: "Rejected" };
  if (status === "checked") return { bg: "rgba(72,84,214,.12)", color: "#4854D6", label: "Link checked" };
  return { bg: "rgba(26,26,26,.08)", color: "rgba(26,26,26,.62)", label: "Self-reported" };
}

export default function ProfilePage() {
  const router = useRouter();
  const app = useBygga();
  const { session } = useSession();
  const [data, setData] = useState<ProfileData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(app.profile?.name ?? "");
  const [avatar, setAvatar] = useState(app.profile?.avatarUrl ?? "");
  const [accountability, setAccountability] = useState<"gentle" | "direct" | "firm">("direct");
  const [emailEnabled, setEmailEnabled] = useState(app.notify);
  const [journeyEmailsEnabled, setJourneyEmailsEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [maxNudges, setMaxNudges] = useState(2);
  const [checkInDays, setCheckInDays] = useState<number[]>(app.profile?.days ?? [0, 2, 4]);
  const [instructions, setInstructions] = useState("");
  const [saved, setSaved] = useState("");
  const [uploading, setUploading] = useState(false);
  const [bugSummary, setBugSummary] = useState("");
  const [bugDetails, setBugDetails] = useState("");
  const [bugSent, setBugSent] = useState(false);
  const [billing, setBilling] = useState<BillingData>({ access: false, paid: false, status: "none", startedAt: null });
  const [accountBusy, setAccountBusy] = useState("");
  const [accountMessage, setAccountMessage] = useState("");

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const headers = await authJsonHeaders();
        const [response, billingResponse, emailPreferenceResponse] = await Promise.all([
          fetch("/api/profile", { headers }),
          fetch("/api/entitlement", { headers, cache: "no-store" }),
          fetch("/api/email/preferences", { headers, cache: "no-store" }),
        ]);
        const payload = response.ok ? await response.json() : EMPTY;
        if (billingResponse.ok) setBilling(await billingResponse.json());
        if (emailPreferenceResponse.ok) {
          const emailPreference = await emailPreferenceResponse.json();
          setJourneyEmailsEnabled(emailPreference.journeyNudgesEnabled !== false);
        }
        setData(payload);
        setName(payload.profile?.name || app.profile?.name || "");
        setAvatar(payload.profile?.avatar_path || app.profile?.avatarUrl || "");
        setCheckInDays(app.profile?.days ?? [0, 2, 4]);
        if (payload.standingOrders) {
          setAccountability(payload.standingOrders.accountability_level);
          setEmailEnabled(payload.standingOrders.email_enabled);
          setPushEnabled(payload.standingOrders.push_enabled);
          setMaxNudges(payload.standingOrders.max_daily_nudges);
          setInstructions((payload.standingOrders.instructions ?? []).join("\n"));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [session, app.profile?.name, app.profile?.avatarUrl, app.profile?.days]);

  const skills = useMemo(() => {
    const saved = data.brain.entities.filter((entity) => entity.kind === "skill");
    if (saved.length) return saved;
    return (app.profile?.skills ?? "").split(",").map((skill) => skill.trim()).filter(Boolean).map((skill, index) => ({ id: `local-${index}`, kind: "skill", name: skill, summary: "Shared during onboarding", confidence: 0.55, source_type: "onboarding", last_verified_at: null }));
  }, [data.brain.entities, app.profile?.skills]);

  async function saveProfile() {
    setSaved("Saving…");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const headers = await authJsonHeaders();
    const [response, emailPreferenceResponse] = await Promise.all([
      fetch("/api/profile", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          name,
          avatarPath: avatar || undefined,
          notify: emailEnabled,
          timezone,
          accountabilityLevel: accountability,
          emailEnabled,
          pushEnabled,
          maxDailyNudges: maxNudges,
          instructions: instructions.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      }),
      fetch("/api/email/preferences", {
        method: "POST",
        headers,
        body: JSON.stringify({ journeyNudgesEnabled: journeyEmailsEnabled }),
      }),
    ]);
    if (response.ok && emailPreferenceResponse.ok) {
      app.updateProfile({ name, avatarUrl: avatar || undefined, days: checkInDays, timezone });
      app.setNotify(emailEnabled);
      setSaved("Saved");
    } else setSaved("Could not save");
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !session) return;
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 4_000_000) {
      setSaved("Use a JPG, PNG or WebP under 4 MB");
      return;
    }
    const client = supabase();
    if (!client) return;
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
      const result = await client.storage.from("avatars").upload(path, file, { cacheControl: "3600", contentType: file.type });
      if (result.error) throw result.error;
      const publicUrl = client.storage.from("avatars").getPublicUrl(result.data.path).data.publicUrl;
      setAvatar(publicUrl);
      app.updateProfile({ avatarUrl: publicUrl });
      await fetch("/api/profile", { method: "PATCH", headers: await authJsonHeaders(), body: JSON.stringify({ avatarPath: publicUrl }) });
      setSaved("Photo updated");
    } catch {
      setSaved("Photo upload failed");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function reportBug(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/bugs", {
      method: "POST",
      headers: await authJsonHeaders(),
      body: JSON.stringify({ category: "bug", severity: "medium", summary: bugSummary, details: bugDetails, path: window.location.pathname }),
    });
    if (response.ok) {
      setBugSummary("");
      setBugDetails("");
      setBugSent(true);
      void track("bug_reported", { path: window.location.pathname });
    }
  }

  async function restartJourney() {
    if (!window.confirm("Restart from onboarding? Your current plan, progress, chats and saved evidence will be erased. Your account and payment status stay the same.")) return;
    setAccountBusy("restart");
    setAccountMessage("");
    const response = await fetch("/api/account/restart", { method: "POST", headers: await authJsonHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      app.resetAll();
      try { localStorage.removeItem("byqqa-onboarding-v1"); } catch {}
      router.replace("/start");
    } else {
      setAccountMessage(payload.error || "Journey restart failed");
      setAccountBusy("");
    }
  }

  async function deleteAccount() {
    if (!window.confirm("Permanently delete your account and all Badger AI content? This cannot be undone.")) return;
    if (!window.confirm("Final confirmation: erase the account, plan, chats, evidence and payment method?")) return;
    setAccountBusy("delete");
    setAccountMessage("");
    const response = await fetch("/api/account", { method: "DELETE", headers: await authJsonHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setAccountMessage(payload.error || "Account deletion failed");
      setAccountBusy("");
      return;
    }
    app.resetAll();
    try { localStorage.removeItem("byqqa-onboarding-v1"); } catch {}
    await supabase()?.auth.signOut({ scope: "local" });
    router.replace("/");
  }

  return (
    <div className="px-4 pt-4 pb-8 min-[360px]:px-5">
      <div className="flex items-center justify-between">
        <Link href="/app" className="grid h-9 w-9 place-items-center rounded-full bg-paper text-ink no-underline shadow-card">←</Link>
        <div className="text-[11px] font-extrabold tracking-[1.4px] text-ink-60">YOU & BO</div>
        <button type="button" onClick={saveProfile} className="border-0 bg-transparent text-[12px] font-bold text-indigo cursor-pointer">Save</button>
      </div>

      <section className="profile-stage mt-4 overflow-hidden rounded-[28px] bg-cobalt-grad text-white shadow-glass">
        <div className="px-5 pt-6 text-center">
          <label className="relative mx-auto block w-fit cursor-pointer">
            <Avatar initial={name[0]?.toUpperCase() || "Y"} src={avatar} size={92} bg="var(--bygga-yellow)" />
            <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-yellow text-[14px] text-ink shadow-card">✎</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="sr-only" disabled={uploading} />
          </label>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} aria-label="Your name" className="mt-4 w-full border-0 bg-transparent text-center text-[27px] font-extrabold tracking-[-.8px] text-white outline-none" />
          <div className="text-[12px] text-white/65">{session?.user.email}</div>
          <div className="mx-auto mt-4 flex max-w-[280px] justify-center gap-2 pb-6">
            <Pill bg="rgba(255,255,255,.14)" color="white">Day {currentDayOf(app)}</Pill>
            <Pill bg="var(--bygga-acid)" color="var(--bygga-ink)">{Object.keys(app.badges).length} achievements</Pill>
          </div>
        </div>
      </section>

      {saved && <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-center text-[12px] font-semibold shadow-card">{saved}</div>}

      <div className="mt-3">
        <PwaInstallCard />
      </div>

      <section className="mt-3 rounded-[22px] bg-paper p-4 shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">HOW BO COACHES YOU</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["gentle", "direct", "firm"] as const).map((level) => (
            <button key={level} type="button" onClick={() => setAccountability(level)} className={`rounded-xl border px-2 py-3 text-[12px] font-bold capitalize cursor-pointer ${accountability === level ? "border-indigo bg-indigo text-white" : "border-ink-10 bg-cream text-ink"}`}>{level}</button>
          ))}
        </div>
        <label className="mt-4 block text-[11px] font-bold text-ink-60">Standing orders for Bo</label>
        <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} placeholder="One instruction per line. Example: Challenge me when I avoid asking for payment." className="mt-1.5 w-full resize-none rounded-xl border border-ink-10 bg-cream px-3 py-3 text-[13px] leading-[1.45] outline-none focus:border-indigo" />
        <div className="mt-3 flex items-center justify-between border-t border-ink-10 pt-3">
          <div><div className="text-[13px] font-bold">Nudges per check-in day</div><div className="text-[11px] text-ink-40">Maximum across email, push and app</div></div>
          <select value={maxNudges} onChange={(event) => setMaxNudges(Number(event.target.value))} className="rounded-lg border border-ink-10 bg-cream px-3 py-2 text-[13px] font-bold"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select>
        </div>
        <div className="mt-3 border-t border-ink-10 pt-3">
          <div className="text-[13px] font-bold">Regular check-in days</div>
          <div className="mt-0.5 text-[11px] text-ink-40">Bo emails or notifies you on these days. Agreed deadlines can still trigger a reminder.</div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {CHECK_IN_DAYS.map((label, index) => {
              const selected = checkInDays.includes(index);
              return <button key={index} type="button" aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]} ${selected ? "selected" : "not selected"}`} onClick={() => setCheckInDays((days) => selected ? (days.length > 1 ? days.filter((day) => day !== index) : days) : [...days, index].sort())} className={`aspect-square rounded-lg border text-[12px] font-extrabold cursor-pointer ${selected ? "border-ink bg-ink text-cream" : "border-ink-10 bg-cream text-ink-40"}`}>{label}</button>;
            })}
          </div>
        </div>
        <Toggle label="Email check-ins" checked={emailEnabled} onChange={setEmailEnabled} />
        <Toggle label="Journey and checkout reminders" checked={journeyEmailsEnabled} onChange={setJourneyEmailsEnabled} />
        <Toggle label="Push notifications" checked={pushEnabled} onChange={setPushEnabled} />
        <Toggle label="Gentle haptics" checked={app.hapticsEnabled} onChange={app.setHapticsEnabled} />
        <Toggle label="Bo sounds" checked={app.soundEnabled} onChange={app.setSoundEnabled} />
        <div className="mt-3 border-t border-ink-10 pt-3 text-[11px] leading-[1.4] text-ink-40">Sounds are off by default. Motion follows your phone&apos;s Reduce Motion setting.</div>
      </section>

      <section id="billing" className="mt-3 scroll-mt-4 rounded-[22px] bg-paper p-4 shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">PAYMENT & ACCOUNT</div>
        <h2 className="mt-1 text-[20px] font-extrabold tracking-[-.4px]">One payment. Never a subscription.</h2>
        <div className="mt-3 rounded-[16px] bg-cream p-3.5">
          {billing.status === "paid" || billing.paid ? <><div className="text-[13px] font-bold">Full 28-day access · $49 paid once</div><div className="mt-1 text-[11px] leading-[1.45] text-ink-60">There is no subscription, renewal or future recurring charge—so there is nothing to cancel.</div></> : <><div className="text-[13px] font-bold">No purchase recorded</div><div className="mt-1 text-[11px] leading-[1.45] text-ink-60">Badger AI costs $49 once for the complete 28-day programme. Leaving checkout never creates a charge.</div></>}
        </div>
        <div className="mt-3 rounded-xl border border-ink-10 p-3 text-[11px] leading-[1.45] text-ink-60">Want to opt out? Turn off journey emails above. You can restart your journey or erase your account and content below.</div>
        <div className="mt-4 border-t border-ink-10 pt-4">
          <button type="button" disabled={Boolean(accountBusy)} onClick={() => void restartJourney()} className="w-full rounded-xl border border-ink-10 bg-cream px-4 py-3 text-[12px] font-bold text-ink disabled:opacity-40">{accountBusy === "restart" ? "Restarting…" : "Restart my journey"}</button>
          <p className="mt-1.5 text-[10.5px] leading-[1.4] text-ink-40">Erases your plan and progress but keeps your account and payment status.</p>
          <button type="button" disabled={Boolean(accountBusy)} onClick={() => void deleteAccount()} className="mt-3 w-full rounded-xl border border-bred/25 bg-transparent px-4 py-3 text-[12px] font-bold text-bred disabled:opacity-40">{accountBusy === "delete" ? "Deleting…" : "Delete my account and content"}</button>
        </div>
        {accountMessage && <div className="mt-3 rounded-xl bg-cream p-3 text-[11.5px] font-semibold">{accountMessage}</div>}
        <div className="mt-3 text-[10.5px] leading-[1.45] text-ink-40">Questions about payment or refunds? Contact your instance operator.</div>
      </section>

      <section className="mt-3 rounded-[22px] bg-paper p-4 shadow-card">
        <div className="flex items-center justify-between"><div><div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">WHAT BO REMEMBERS</div><div className="mt-1 text-[12px] text-ink-60">Saved facts have a source. Personal memories require your approval.</div></div><span className="text-[22px]">🧠</span></div>
        {loading ? <div className="mt-4 text-[12px] text-ink-40">Loading Bo’s memory…</div> : (
          <div className="mt-3 flex flex-col gap-2">
            {data.brain.brief.known.map((fact, index) => <div key={`${fact.source}-${index}`} className="rounded-xl bg-cream p-3"><div className="text-[13px] font-semibold leading-[1.4]">{fact.text}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-[.6px] text-ink-40">Source: {fact.source}{fact.fresh ? " · current" : " · may be stale"}</div></div>)}
            {data.memories.slice(0, 4).map((memory) => <div key={memory.id} className="rounded-xl border border-ink-10 p-3"><div className="flex items-center gap-2"><Pill bg="var(--bygga-ink10)" color="var(--bygga-ink60)">{memory.kind}</Pill><Pill bg={memory.status === "approved" ? "rgba(24,128,90,.13)" : "rgba(240,184,44,.18)"} color={memory.status === "approved" ? "#146C4E" : "#7B5B00"}>{memory.status}</Pill></div><div className="mt-2 text-[13px] leading-[1.4]">{memory.content}</div></div>)}
            {!data.brain.brief.known.length && !data.memories.length && <div className="rounded-xl bg-cream p-3 text-[12px] text-ink-60">Bo starts with your onboarding answers and adds sourced learning as you complete work.</div>}
          </div>
        )}
      </section>

      <section className="mt-3 rounded-[22px] bg-paper p-4 shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">YOUR SKILLS</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {skills.length ? skills.map((skill) => <Pill key={skill.id} bg="rgba(72,84,214,.11)" color="var(--bygga-indigo)">{skill.name}</Pill>) : <span className="text-[12px] text-ink-60">Bo will build this from onboarding and completed work.</span>}
        </div>
      </section>

      <section className="mt-3 rounded-[22px] bg-paper p-4 shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-indigo">FOUNDER ACTIVITY GRAPH</div>
        <p className="mt-1 text-[12px] leading-[1.45] text-ink-60">This is the Runna-style evidence layer for entrepreneurship. Bo labels every claim honestly.</p>
        <div className="mt-3 flex flex-col gap-2">
          {data.evidence.slice(0, 8).map((item) => { const tone = statusTone(item.status); return <div key={item.id} className="rounded-xl border border-ink-10 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[.7px] text-ink-40">{item.day_num ? `Day ${item.day_num} · ` : ""}{item.claim_type}</span><Pill bg={tone.bg} color={tone.color}>{tone.label}</Pill></div><div className="mt-1.5 text-[13px] font-semibold leading-[1.4]">{item.claim_summary}</div>{item.verdict_note && <div className="mt-1 text-[11.5px] text-ink-60">{item.verdict_note}</div>}</div>; })}
          {!data.evidence.length && <div className="rounded-xl bg-cream p-3 text-[12px] text-ink-60">Public post and landing-page links can be checked now. Stripe sales, sent email and social account connections are the next verifier integrations.</div>}
        </div>
      </section>

      <form onSubmit={reportBug} className="mt-3 rounded-[22px] bg-ink p-4 text-cream shadow-card">
        <div className="text-[10px] font-extrabold tracking-[1.1px] text-yellow">REPORT A PROBLEM</div>
        <p className="mt-1 text-[12px] leading-[1.45] text-white/60">Tell us what happened and what you expected. The page and device type are attached automatically.</p>
        {bugSent ? <div className="mt-3 rounded-xl bg-white/10 p-3 text-[13px] font-semibold">Received. Thank you. We can now track this in the owner dashboard.</div> : <>
          <input value={bugSummary} onChange={(event) => setBugSummary(event.target.value)} required maxLength={180} placeholder="Short summary" className="mt-3 w-full rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/35" />
          <textarea value={bugDetails} onChange={(event) => setBugDetails(event.target.value)} required rows={3} placeholder="What happened? What did you expect?" className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-[13px] text-white outline-none placeholder:text-white/35" />
          <button type="submit" className="spring mt-2 w-full rounded-xl border-0 bg-yellow px-4 py-3 text-[13px] font-bold text-ink cursor-pointer">Send report</button>
        </>}
      </form>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="mt-3 flex items-center justify-between border-t border-ink-10 pt-3"><span className="text-[13px] font-bold">{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative h-7 w-12 rounded-full border-0 cursor-pointer ${checked ? "bg-indigo" : "bg-ink-10"}`}><span className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: checked ? "translateX(20px)" : "translateX(0)" }} /></button></div>;
}
