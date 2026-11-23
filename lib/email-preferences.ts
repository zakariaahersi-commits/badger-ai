import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function preferenceSecret(override?: string): string | null {
  return override?.trim() || process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() || null;
}

export function emailPreferenceToken(userId: string, secretOverride?: string): string | null {
  const secret = preferenceSecret(secretOverride);
  if (!secret) return null;
  return createHmac("sha256", secret).update(`journey-nudges:${userId}`).digest("base64url");
}

export function validEmailPreferenceToken(userId: string, token: string, secretOverride?: string): boolean {
  const expected = emailPreferenceToken(userId, secretOverride);
  if (!expected) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function emailUnsubscribeUrl(userId: string, siteUrl: string, secretOverride?: string): string | null {
  const token = emailPreferenceToken(userId, secretOverride);
  if (!token) return null;
  const url = new URL("/api/email/unsubscribe", siteUrl);
  url.searchParams.set("user", userId);
  url.searchParams.set("token", token);
  return url.toString();
}
