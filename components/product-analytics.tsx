"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/telemetry";
import { hasActiveEntitlement } from "@/lib/payments";
import { useSession } from "@/lib/sync";
import {
  clearLayersUser,
  consumeLayersAuthIntent,
  identifyLayersUser,
  screenLayers,
} from "@/lib/layers-analytics";

export function ProductAnalytics() {
  const pathname = usePathname();
  const { session, ready } = useSession();
  const identifiedUser = useRef<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/ops")) return;
    void track("page_view");
    void screenLayers(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!ready || pathname.startsWith("/ops")) return;
    if (!session) {
      if (identifiedUser.current) void clearLayersUser();
      identifiedUser.current = null;
      return;
    }
    let cancelled = false;
    const user = session.user;
    const intent = consumeLayersAuthIntent();
    (async () => {
      const access = await hasActiveEntitlement();
      if (cancelled) return;
      await identifyLayersUser({
        userId: user.id,
        signupDate: user.created_at.slice(0, 10),
        authProvider: String(user.app_metadata?.provider || "account"),
        accessTier: access.access ? "paid_once" : "account",
      });
      identifiedUser.current = user.id;
      if (intent) {
        const createdAt = Date.parse(user.created_at);
        const newAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 15 * 60_000;
        void track(intent === "sign_up" && newAccount ? "account_created" : "signed_in", {
          provider: String(user.app_metadata?.provider || "account"),
        });
      }
    })();
    return () => { cancelled = true; };
  }, [pathname, ready, session]);
  return null;
}
