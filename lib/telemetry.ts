"use client";

import { authJsonHeaders } from "./cloud";
import { trackLayersProductEvent } from "./layers-analytics";

export type ProductEvent =
  | "page_view"
  | "onboarding_landed"
  | "onboarding_started"
  | "onboarding_capture_viewed"
  | "onboarding_account_captured"
  | "onboarding_resume_scheduled"
  | "onboarding_recovery_email_sent"
  | "idea_finder_viewed"
  | "idea_database_matched"
  | "idea_opportunity_selected"
  | "onboarding_step_viewed"
  | "onboarding_step_completed"
  | "onboarding_answered"
  | "bo_reflection_shown"
  | "onboarding_ai_timeout"
  | "diagnosis_viewed"
  | "plan_reveal_viewed"
  | "plan_reveal_cta_clicked"
  | "journey_save_viewed"
  | "account_save_started"
  | "account_save_completed"
  | "paywall_viewed"
  | "paywall_cta_clicked"
  | "onboarding_completed"
  | "account_created"
  | "account_oauth_started"
  | "signed_in"
  | "checkout_started"
  | "checkout_completed"
  | "checkout_failed"
  | "demo_started"
  | "demo_completed"
  | "demo_cta_clicked"
  | "today_task_viewed"
  | "task_started"
  | "bo_help_opened"
  | "coach_viewed"
  | "evidence_prompt_viewed"
  | "evidence_added"
  | "task_completed"
  | "achievement_unlocked"
  | "launch_receipt_shared"
  | "coach_message_sent"
  | "push_enabled"
  | "imessage_link_created"
  | "imessage_link_opened"
  | "bug_reported"
  | "client_error";

const ANONYMOUS_KEY = "badger-anonymous-id";
const FIRST_TOUCH_KEY = "badger-first-touch-v1";

type FirstTouch = Record<string, string | boolean>;

function firstTouch(): FirstTouch {
  const existing = localStorage.getItem(FIRST_TOUCH_KEY);
  if (existing) {
    try { return JSON.parse(existing) as FirstTouch; } catch { /* rebuild below */ }
  }
  const params = new URLSearchParams(window.location.search);
  let referrer = "";
  try {
    const url = new URL(document.referrer);
    referrer = `${url.origin}${url.pathname}`.slice(0, 220);
  } catch { /* direct visit or invalid referrer */ }
  const touch: FirstTouch = {
    utm_source: (params.get("utm_source") || "").slice(0, 120),
    utm_medium: (params.get("utm_medium") || "").slice(0, 120),
    utm_campaign: (params.get("utm_campaign") || "").slice(0, 120),
    utm_content: (params.get("utm_content") || "").slice(0, 120),
    referrer,
    device: window.matchMedia("(max-width: 640px)").matches ? "mobile" : "desktop",
    standalone: window.matchMedia("(display-mode: standalone)").matches,
  };
  try { localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch)); } catch { /* optional */ }
  return touch;
}

export function firstTouchAttribution(): FirstTouch {
  return typeof window === "undefined" ? {} : firstTouch();
}

function anonymousId(): string {
  let id = sessionStorage.getItem(ANONYMOUS_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(ANONYMOUS_KEY, id);
  }
  return id;
}

export async function track(event: ProductEvent, properties: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const enriched = { ...firstTouch(), ...properties };
  void trackLayersProductEvent(event, { path: window.location.pathname, ...enriched });
  try {
    const headers = await authJsonHeaders();
    void fetch("/api/events", {
      method: "POST",
      headers,
      keepalive: true,
      body: JSON.stringify({
        event,
        anonymousId: anonymousId(),
        path: window.location.pathname,
        properties: enriched,
      }),
    });
  } catch {
    // Telemetry must never interrupt the founder's work.
  }
}
