"use client";

// Shared community feed helpers — cloud (Supabase) with local fallback.

import { cloudEnabled, supabase } from "./cloud";
import type { CommunityPost } from "./types";

export async function fetchCloudPosts(): Promise<CommunityPost[] | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("posts")
    .select("id, name, body, tag, week, fire, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data) return null;
  const uid = (await sb.auth.getUser()).data.user?.id;
  return data.map((p) => ({
    id: p.id as string,
    who: p.name as string,
    initial: ((p.name as string) || "B")[0].toUpperCase(),
    when: timeAgo(new Date(p.created_at as string)),
    week: (p.week as string) || "",
    body: p.body as string,
    fire: (p.fire as number) ?? 0,
    comments: 0,
    tag: (p.tag as CommunityPost["tag"]) ?? undefined,
    mine: uid != null && p.user_id === uid,
  }));
}

export async function publishCloudPost(
  body: string,
  tag: CommunityPost["tag"] | undefined,
  name: string,
  week: string
): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return false;
  const { error } = await sb.from("posts").insert({ user_id: user.id, name, body, tag: tag ?? null, week });
  return !error;
}

export async function fetchCloudComments(postId: string): Promise<string[] | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("comments")
    .select("name, body")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error || !data) return null;
  return data.map((c) => `${c.name}: ${c.body}`);
}

export async function publishCloudComment(postId: string, body: string, name: string): Promise<boolean> {
  const sb = supabase();
  if (!sb) return false;
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return false;
  const { error } = await sb.from("comments").insert({ post_id: postId, user_id: user.id, name, body });
  return !error;
}

export async function fireCloudPost(postId: string): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const user = (await sb.auth.getUser()).data.user;
  if (!user) return;
  await sb.from("post_fires").insert({ post_id: postId, user_id: user.id });
}

export { cloudEnabled };

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
