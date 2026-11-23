"use client";

import type { LayersClient, UserProperties } from "@layers/client";
import type { ProductEvent } from "./telemetry";
import { layersEventName, layersEventProperties } from "./layers-events";

const LAYERS_APP_ID = "app_21d7930980b892c9";
const AUTH_INTENT_KEY = "badger-layers-auth-intent-v1";
const PURCHASE_KEY_PREFIX = "badger-layers-purchase-v1:";

export type LayersAuthIntent = "sign_up" | "login";

let clientPromise: Promise<LayersClient | null> | null = null;

async function layersClient(): Promise<LayersClient | null> {
  if (typeof window === "undefined") return null;
  if (!clientPromise) {
    clientPromise = import("@layers/client")
      .then(async ({ LayersClient }) => {
        const client = new LayersClient({
          appId: LAYERS_APP_ID,
          environment: process.env.NODE_ENV === "production" ? "production" : "development",
          enableDebug: process.env.NODE_ENV !== "production",
          flushIntervalMs: 30_000,
          flushThreshold: 20,
          autoTrackAppOpen: true,
          autoTrackDeepLinks: true,
          autoTrackExceptions: true,
        });
        client.on("error", (error) => {
          if (process.env.NODE_ENV !== "production") console.warn("[layers]", error.message);
        });
        await client.init();
        // Badger uses Layers for first-party product analytics and attribution,
        // never ad targeting or personalized advertising.
        client.setConsent({
          analyticsStorage: true,
          adStorage: false,
          adUserData: false,
          adPersonalization: false,
        });
        client.setSuperProperties({ product_id: "badger-28-day", purchase_model: "one_time" });
        return client;
      })
      .catch((error) => {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[layers] initialization failed", error instanceof Error ? error.message : "unknown_error");
        }
        clientPromise = null;
        return null;
      });
  }
  return clientPromise;
}

export async function trackLayersProductEvent(
  event: ProductEvent,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const eventName = layersEventName(event);
    const clean = layersEventProperties(properties);
    const transactionId = typeof clean.transaction_id === "string" ? clean.transaction_id : null;
    if (eventName === "purchase_success" && transactionId) {
      const key = `${PURCHASE_KEY_PREFIX}${transactionId}`;
      if (localStorage.getItem(key) === "1") return;
      (await layersClient())?.track(eventName, clean);
      localStorage.setItem(key, "1");
      return;
    }
    (await layersClient())?.track(eventName, clean);
  } catch {
    // Third-party analytics must never interrupt a founder's work.
  }
}

export async function screenLayers(pathname: string): Promise<void> {
  try {
    (await layersClient())?.screen(pathname, layersEventProperties({ path: pathname }));
  } catch {
    // Navigation remains usable when analytics is unavailable.
  }
}

export async function identifyLayersUser(input: {
  userId: string;
  signupDate: string;
  authProvider: string;
  accessTier: "account" | "paid_once";
}): Promise<void> {
  try {
    const client = await layersClient();
    if (!client) return;
    client.setAppUserId(input.userId);
    client.setUserPropertiesOnce({ signup_date: input.signupDate } satisfies UserProperties);
    client.setUserProperties({
      auth_provider: input.authProvider,
      access_tier: input.accessTier,
      purchase_model: "one_time",
    } satisfies UserProperties);
    client.setSuperProperties({ access_tier: input.accessTier });
  } catch {
    // Identity enrichment is optional and must not affect authentication.
  }
}

export async function clearLayersUser(): Promise<void> {
  try { (await layersClient())?.reset(); } catch { /* optional */ }
}

export function markLayersAuthIntent(intent: LayersAuthIntent): void {
  try { localStorage.setItem(AUTH_INTENT_KEY, intent); } catch { /* optional */ }
}

export function clearLayersAuthIntent(): void {
  try { localStorage.removeItem(AUTH_INTENT_KEY); } catch { /* optional */ }
}

export function consumeLayersAuthIntent(): LayersAuthIntent | null {
  try {
    const value = localStorage.getItem(AUTH_INTENT_KEY);
    localStorage.removeItem(AUTH_INTENT_KEY);
    return value === "sign_up" || value === "login" ? value : null;
  } catch {
    return null;
  }
}
