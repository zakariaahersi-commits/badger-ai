"use client";

// Cross-device sync: the whole zustand snapshot lives in one jsonb row per
// user (last write wins, debounced). On sign-in we adopt whichever side is
// newer. Mounted once in the app shell; a no-op in local mode.

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { authJsonHeaders, cloudEnabled, supabase } from "./cloud";
import {
  LAST_LOCAL_CHANGE_KEY,
  isLocalSyncSuspended,
  prepareLocalAccount,
} from "./account-isolation";
import { repairPersistedSnapshot, useBygga } from "./store";

export function markLocalChange() {
  try {
    localStorage.setItem(LAST_LOCAL_CHANGE_KEY, String(Date.now()));
  } catch {}
}

export function useSession(): { session: Session | null; ready: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, ready };
}

async function pushSnapshot(activeSession: Session, state: ReturnType<typeof useBygga.getState>) {
  if (typeof window !== "undefined" && isLocalSyncSuspended(localStorage)) return;
  const sb = supabase();
  if (!sb) return;
  const { onboarded, profile, planStart, demoDayOffset, tasks, logs, badges, outcome, outcomeNote, day14Decision, gateDismissedDay, intentions, posts, comments, chat, connections, notify, soundEnabled, hapticsEnabled } = state;
  await sb.from("sprints").upsert({
    user_id: activeSession.user.id,
    state: { onboarded, profile, planStart, demoDayOffset, tasks, logs, badges, outcome, outcomeNote, day14Decision, gateDismissedDay, intentions, posts, comments, chat, connections, notify, soundEnabled, hapticsEnabled },
    updated_at: new Date().toISOString(),
  });
  if (profile) {
    await sb.from("profiles").upsert({
      user_id: activeSession.user.id,
      email: activeSession.user.email ?? "",
      name: profile.name,
      avatar_path: profile.avatarUrl ?? null,
      idea_short: profile.ideaShort,
      plan_start: planStart,
      notify: state.notify,
    });
  }
}

export function CloudSync() {
  const { session } = useSession();
  const [syncedUser, setSyncedUser] = useState<string | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulledFor = useRef<string | null>(null);
  const welcomeAttemptedFor = useRef<string | null>(null);
  const onboarded = useBygga((state) => state.onboarded);
  const profile = useBygga((state) => state.profile);
  const planStart = useBygga((state) => state.planStart);
  const tasks = useBygga((state) => state.tasks);

  // Pull on sign-in: adopt remote if it's newer than our local changes.
  useEffect(() => {
    const sb = supabase();
    if (!sb || !session || pulledFor.current === session.user.id) return;
    pulledFor.current = session.user.id;
    let cancelled = false;
    (async () => {
      const ownership = prepareLocalAccount(localStorage, session.user.id);
      if (ownership === "reset") useBygga.getState().resetAll();
      const { data } = await sb
        .from("sprints")
        .select("state, updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data?.state) {
        const remoteAt = new Date(data.updated_at).getTime();
        const localAt = Number(localStorage.getItem(LAST_LOCAL_CHANGE_KEY) ?? 0);
        const local = useBygga.getState();
        if (remoteAt > localAt || !local.onboarded) {
          const repaired = repairPersistedSnapshot(data.state as Partial<ReturnType<typeof useBygga.getState>>);
          useBygga.setState({
            ...repaired,
            // Purchase state is always re-checked against the server-side
            // entitlement table by the app shell.
            paid: false,
          });
        }
      }
      // A first account can claim the anonymous onboarding it just completed.
      // After an account switch, never upload the previous in-memory snapshot.
      if (ownership !== "reset") await pushSnapshot(session, useBygga.getState());
    })().finally(() => {
      if (!cancelled) {
        useBygga.setState({ cloudHydratedUserId: session.user.id });
        setSyncedUser(session.user.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Push on change, debounced 2.5s.
  useEffect(() => {
    const sb = supabase();
    if (!sb || !session) return;
    const unsub = useBygga.subscribe((state) => {
      if (isLocalSyncSuspended(localStorage)) return;
      markLocalChange();
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(async () => {
        if (isLocalSyncSuspended(localStorage)) return;
        await pushSnapshot(session, state);
      }, 2500);
    });
    return () => {
      unsub();
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [session]);

  // Send the personal welcome note after onboarding and authenticated sign-in.
  // The server checks recency and records an idempotency event, so reloads do
  // not send another copy.
  useEffect(() => {
    if (!session || syncedUser !== session.user.id || !onboarded || !profile || !planStart) return;
    if (welcomeAttemptedFor.current === session.user.id) return;
    welcomeAttemptedFor.current = session.user.id;
    const firstTask = tasks.find((task) => task.day === 1);
    (async () => {
      try {
        const response = await fetch("/api/welcome", {
          method: "POST",
          headers: await authJsonHeaders(),
          body: JSON.stringify({ name: profile.name, planStart, firstTask }),
        });
        if (!response.ok) welcomeAttemptedFor.current = null;
      } catch {
        welcomeAttemptedFor.current = null;
      }
    })();
  }, [session, syncedUser, onboarded, profile, planStart, tasks]);

  return null;
}
