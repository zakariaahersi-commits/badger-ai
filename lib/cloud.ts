"use client";

// Cloud seam — the single place that knows whether Byqqa is running in
// local mode (no keys, everything in localStorage, clearly labeled) or
// cloud mode (Supabase auth + sync). Components ask, never assume.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const cloudEnabled = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!cloudEnabled) return null;
  if (!client) client = createClient(url!, anon!);
  return client;
}

export async function authJsonHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = await supabase()?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export const stripeEnabled = Boolean(process.env.NEXT_PUBLIC_STRIPE_ENABLED === "1");

// Demo time-travel (jump to Day 14/28). Hidden from real users: only on in
// dev or when NEXT_PUBLIC_DEMO_MODE=1, so production users can't fast-forward
// themselves into the kill gate.
export const demoMode =
  process.env.NEXT_PUBLIC_DEMO_MODE === "1" || process.env.NODE_ENV !== "production";
