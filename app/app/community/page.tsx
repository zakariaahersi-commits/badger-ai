"use client";

// Community — other people's receipts. One feed, weekly prompt,
// Ship-of-the-Week and Kill-of-the-Week given equal status (PRD §6.4).

import { useCallback, useEffect, useState } from "react";
import { Avatar, Card, Pill } from "@/components/ui";
import { BrandBo } from "@/components/brand-bo";
import { useRouter } from "next/navigation";
import { useBygga } from "@/lib/store";
import { cloudEnabled, fetchCloudComments, fetchCloudPosts, fireCloudPost, publishCloudComment, publishCloudPost } from "@/lib/feed";
import { authJsonHeaders } from "@/lib/cloud";
import { useSession } from "@/lib/sync";
import type { CommunityPost } from "@/lib/types";

const FILTERS = ["All", "Wins", "Stuck", "Killed"] as const;

export default function CommunityPage() {
  const s = useBygga();
  const router = useRouter();
  const { session } = useSession();
  const [cloudPosts, setCloudPosts] = useState<CommunityPost[] | null>(null);
  const [cloudThreadComments, setCloudThreadComments] = useState<string[] | null>(null);

  const reload = useCallback(() => {
    if (!cloudEnabled) return;
    fetchCloudPosts().then(setCloudPosts);
  }, []);
  useEffect(reload, [reload]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [draft, setDraft] = useState("");
  const [composer, setComposer] = useState(false);
  const [shareConfirmed, setShareConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const [fired, setFired] = useState<Record<string, boolean>>({});
  const [hiddenPosts, setHiddenPosts] = useState<Record<string, boolean>>({});
  const [thread, setThread] = useState<CommunityPost | null>(null);
  const [reply, setReply] = useState("");
  const [optimisticFire, setOptimisticFire] = useState<Record<string, number>>({});

  if (!s.profile) return null;

  // Only show real member posts. Fictional people and engagement numbers must
  // never be presented as social proof inside the live product.
  const all = cloudEnabled ? (cloudPosts ?? []) : s.posts;
  const posts = all.filter((p) => {
    if (hiddenPosts[p.id]) return false;
    if (filter === "All") return true;
    if (filter === "Wins") return p.tag === "win";
    if (filter === "Stuck") return p.tag === "stuck" || !p.tag;
    return p.tag === "kill";
  });

  const fire = (p: CommunityPost) => {
    if (fired[p.id]) return;
    setFired((f) => ({ ...f, [p.id]: true }));
    const isCloud = cloudEnabled && cloudPosts?.some((x) => x.id === p.id);
    if (isCloud) {
      fireCloudPost(p.id);
      setOptimisticFire((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 }));
    } else if (p.mine || s.posts.some((x) => x.id === p.id)) s.firePost(p.id);
    else setOptimisticFire((m) => ({ ...m, [p.id]: (m[p.id] ?? 0) + 1 }));
  };

  const openThread = (p: CommunityPost) => {
    setThread(p);
    setCloudThreadComments(null);
    if (cloudEnabled && cloudPosts?.some((x) => x.id === p.id)) {
      fetchCloudComments(p.id).then(setCloudThreadComments);
    }
  };

  const submitPost = async (body: string, tag?: CommunityPost["tag"]) => {
    if (cloudEnabled) {
      if (!session) {
        router.push("/auth?next=/app/community");
        return;
      }
      const week = `Week ${Math.min(4, Math.ceil((Object.keys(s.logs).length || 1) / 7))}`;
      const ok = await publishCloudPost(body, tag, s.profile?.name ?? "Builder", week);
      if (ok) {
        setNotice("Posted to the paid community.");
        reload();
      } else {
        setNotice("That did not post. Please try again.");
      }
      return;
    }
    s.addPost(body, tag);
  };

  const reportPost = async (post: CommunityPost) => {
    setHiddenPosts((current) => ({ ...current, [post.id]: true }));
    setNotice("Hidden and reported. Thank you.");
    try {
      const response = await fetch("/api/bugs", {
        method: "POST",
        headers: await authJsonHeaders(),
        body: JSON.stringify({
          category: "confusing",
          severity: "high",
          summary: `Community report: ${post.id}`,
          details: `Reported post by ${post.who}: ${post.body}`.slice(0, 3_000),
          path: "/app/community",
        }),
      });
      if (!response.ok) throw new Error("report_failed");
    } catch {
      setNotice("The post is hidden on this device. The report could not be sent.");
    }
  };

  return (
    <div className="px-5 pt-4 flex flex-col gap-3">
      <div className="flex items-end justify-between pt-1 pb-1">
        <div>
          <div className="text-[11px] font-bold tracking-[1.4px] uppercase text-ink-60 mb-0.5">
            Cohort · the founding wave
          </div>
          <div className="text-[22px] font-bold tracking-[-0.5px]">You&apos;re not doing this alone.</div>
        </div>
        <Avatar initial={s.profile.name[0]?.toUpperCase()} />
      </div>
      {notice && <div role="status" className="rounded-xl bg-paper px-3 py-2 text-[11px] font-semibold text-ink-60 shadow-card">{notice}</div>}

      {/* Weekly prompt — pinned */}
      <div className="relative flex items-center gap-2 overflow-hidden rounded-[26px] bg-cobalt-grad p-4 text-white shadow-glass">
        <div className="absolute -right-8 -top-12 h-36 w-36 rounded-full border border-white/15 bg-white/10" aria-hidden="true" />
        <div className="relative z-10 flex-1 min-w-0">
          <div className="text-[10px] font-bold tracking-[1px] text-acid mb-1">THIS WEEK&apos;S PROMPT · PINNED</div>
          <div className="text-[15px] font-bold leading-[1.3]">
            What did you do this week that scared you?
          </div>
          <button
            type="button"
            onClick={() => { setShareConfirmed(false); setComposer(true); }}
            className="spring mt-2.5 min-h-11 rounded-full border border-white/20 bg-white px-4 py-2 text-[12px] font-bold text-cobalt cursor-pointer"
          >
            Answer it →
          </button>
        </div>
        <BrandBo size={116} alt="Bo with this week's prompt" className="relative z-10 -mb-5 -mr-3 shrink-0 bo-float" />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap cursor-pointer"
            style={{
              background: filter === f ? "var(--bygga-ink)" : "transparent",
              color: filter === f ? "var(--bygga-bg)" : "var(--bygga-ink60)",
              border: filter === f ? "none" : "1px solid var(--bygga-ink10)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Feed */}
      {!posts.length && (
        <Card className="!p-5 text-center">
          <BrandBo size={88} alt="Bo waiting for the first real community update" className="mx-auto" />
          <div className="mt-2 text-[16px] font-bold">No member updates yet.</div>
          <p className="mx-auto mt-1 max-w-[300px] text-[12px] leading-[1.5] text-ink-60">Be the first to share useful progress. Nothing here is fabricated.</p>
        </Card>
      )}
      {posts.map((p) => (
        <Card key={p.id} className="!p-4">
          <div className="flex items-center gap-2.5 mb-2">
            <Avatar initial={p.initial} size={30} bg={p.mine ? "var(--bygga-teal)" : "var(--bygga-yellow)"} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold">
                {p.who}
                {p.mine && <span className="text-ink-40 font-medium"> · you</span>}
              </div>
              <div className="text-[10.5px] text-ink-60">
                {p.week} · {p.when}
              </div>
            </div>
            {p.tag === "win" && (
              <Pill bg="var(--bygga-yellow)" color="#1A1A1A">
                🎯 First $
              </Pill>
            )}
            {p.tag === "kill" && (
              <Pill bg="rgba(239,68,68,0.12)" color="var(--bygga-red)">
                🪦 Killed smart
              </Pill>
            )}
            {p.tag === "stuck" && (
              <Pill bg="var(--bygga-ink10)" color="var(--bygga-ink60)">
                Stuck
              </Pill>
            )}
          </div>
          <div className="text-[13px] leading-[1.45] mb-2.5">{p.body}</div>
          <div className="flex gap-3 text-[11px] text-ink-60 font-semibold">
            <button type="button" onClick={() => fire(p)} className="bg-transparent border-none cursor-pointer p-0 font-semibold" style={{ color: fired[p.id] ? "var(--bygga-red)" : "var(--bygga-ink60)" }}>
              🔥 {p.fire + (optimisticFire[p.id] ?? 0)}
            </button>
            <button type="button" onClick={() => openThread(p)} className="bg-transparent border-none cursor-pointer p-0 font-semibold text-ink-60">
              💬 {p.comments + (s.comments[p.id]?.length ?? 0) - (p.mine ? (s.comments[p.id]?.length ?? 0) : 0)}
            </button>
            {!p.mine && <button type="button" onClick={() => void reportPost(p)} className="ml-auto border-none bg-transparent p-0 text-[10px] font-semibold text-ink-40 underline underline-offset-2">Report</button>}
          </div>
        </Card>
      ))}

      {/* Weekly reflection */}
      <Card className="!p-4" style={{ border: "1.5px dashed var(--bygga-ink20)" }}>
        <div className="text-[10px] font-bold tracking-[1px] text-ink-60 mb-1.5">WEEKLY REFLECTION</div>
        <div className="text-[13px] leading-[1.45]">
          Share a useful win, an honest stuck moment or a considered stop. A smart stop can teach
          the community as much as a launch.
        </div>
      </Card>

      {/* Composer */}
      {composer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(26,26,26,0.55)" }} onClick={() => setComposer(false)}>
          <div className="w-full max-w-[480px] bg-cream rounded-t-[22px] px-6 pt-5 pb-7 anim-rise" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] font-bold tracking-[1.2px] text-ink-60 mb-3">POST TO THE COHORT</div>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 400))}
              placeholder="What did you do this week that scared you?"
              rows={4}
              className="w-full px-3.5 py-3 text-[15px] leading-[1.45] border-[1.5px] border-ink rounded-xl bg-paper resize-none outline-none placeholder:text-ink-20"
            />
            <label className="mt-3 flex items-start gap-2.5 rounded-xl bg-paper p-3 text-[11px] leading-[1.4] text-ink-60">
              <input type="checkbox" checked={shareConfirmed} onChange={(event) => setShareConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-ink" />
              <span>I removed customer names, contact details and anything commercially sensitive. I understand paid Badger members can read this.</span>
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!draft.trim() || !shareConfirmed) return;
                  await submitPost(draft.trim());
                  setDraft("");
                  setShareConfirmed(false);
                  setComposer(false);
                  setFilter("All");
                }}
                disabled={!draft.trim() || !shareConfirmed}
                className="flex-1 py-3.5 rounded-xl bg-yellow text-ink font-bold text-[15px] border-none cursor-pointer shadow-btn-yellow disabled:cursor-not-allowed disabled:opacity-40"
              >
                Post it
              </button>
              <button type="button" onClick={() => setComposer(false)} className="px-4 py-3.5 rounded-xl bg-transparent border border-ink-20 text-ink-60 font-semibold text-[14px] cursor-pointer">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment thread */}
      {thread && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(26,26,26,0.55)" }} onClick={() => setThread(null)}>
          <div className="w-full max-w-[480px] bg-cream rounded-t-[22px] px-6 pt-5 pb-7 anim-rise max-h-[85dvh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] font-bold tracking-[1.2px] text-ink-60">{thread.who.toUpperCase()} · {thread.week}</div>
              <button type="button" onClick={() => setThread(null)} className="w-7 h-7 rounded-full bg-ink-10 border-none text-[15px] cursor-pointer">×</button>
            </div>
            <div className="text-[14px] leading-[1.45] bg-paper shadow-card rounded-2xl p-4 mb-4">{thread.body}</div>
            <div className="flex flex-col gap-2 mb-4">
              {(cloudThreadComments ?? (s.comments[thread.id] ?? [])).map((c, i) => {
                const mine = !cloudThreadComments;
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <Avatar initial={mine ? (s.profile?.name?.[0]?.toUpperCase() ?? "Y") : "B"} size={26} bg={mine ? "var(--bygga-teal)" : "var(--bygga-bg-warm)"} />
                    <div className="flex-1 text-[13px] leading-[1.4] bg-paper rounded-xl px-3 py-2 shadow-card">{c}</div>
                  </div>
                );
              })}
              {!(cloudThreadComments?.length ?? s.comments[thread.id]?.length ?? 0) && (
                <div className="text-[12px] text-ink-40 text-center py-2">No replies yet. Be the first.</div>
              )}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!reply.trim()) return;
                if (cloudEnabled && cloudPosts?.some((x) => x.id === thread.id)) {
                  if (!session) {
                    router.push("/auth?next=/app/community");
                    return;
                  }
                  const ok = await publishCloudComment(thread.id, reply.trim(), s.profile?.name ?? "Builder");
                  if (ok) fetchCloudComments(thread.id).then(setCloudThreadComments);
                } else {
                  s.addComment(thread.id, reply.trim());
                }
                setReply("");
              }}
              className="flex items-center gap-2 bg-paper shadow-card rounded-[22px] pl-3.5 pr-2 py-2"
            >
              <input value={reply} onChange={(e) => setReply(e.target.value.slice(0, 280))} placeholder="Reply with something useful…" className="flex-1 bg-transparent border-none outline-none text-[14px] placeholder:text-ink-40" />
              <button type="submit" disabled={!reply.trim()} className="w-8 h-8 rounded-full bg-ink text-cream text-[14px] border-none cursor-pointer disabled:opacity-30">↑</button>
            </form>
          </div>
        </div>
      )}

      {/* FAB */}
      {!composer && (
        <button
          type="button"
          onClick={() => { setShareConfirmed(false); setComposer(true); }}
          className="fixed bottom-24 right-[max(16px,calc(50%-224px))] w-13 h-13 rounded-full bg-ink text-cream text-[22px] border-none cursor-pointer shadow-comic z-30"
          style={{ width: 52, height: 52 }}
          aria-label="New post"
        >
          +
        </button>
      )}
    </div>
  );
}
