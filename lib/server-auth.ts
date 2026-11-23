import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export interface ServerAuth {
  userId: string | null;
  email: string | null;
  service: SupabaseClient | null;
  invalid: boolean;
  authMethods: string[];
  identityProviders: string[];
}

function authMethodsFromClaims(amr: unknown): string[] {
  if (!Array.isArray(amr)) return [];
  return amr.flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (entry && typeof entry === "object" && "method" in entry && typeof entry.method === "string") {
      return [entry.method];
    }
    return [];
  });
}

export async function serverAuth(req: NextRequest): Promise<ServerAuth> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) return { userId: null, email: null, service: null, invalid: false, authMethods: [], identityProviders: [] };
  if (!url || !anon || !serviceKey) return { userId: null, email: null, service: null, invalid: true, authMethods: [], identityProviders: [] };

  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const claimsResult = await verifier.auth.getClaims(token);
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return { userId: null, email: null, service: null, invalid: true, authMethods: [], identityProviders: [] };
  }
  const claims = claimsResult.data.claims;
  const providers = Array.isArray(claims.app_metadata?.providers)
    ? claims.app_metadata.providers.filter((provider): provider is string => typeof provider === "string")
    : [];
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    service: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    invalid: false,
    authMethods: authMethodsFromClaims(claims.amr),
    identityProviders: [...new Set(providers)],
  };
}
