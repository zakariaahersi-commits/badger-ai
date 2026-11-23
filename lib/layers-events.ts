import type { ProductEvent } from "./telemetry";

export type LayersProperty = string | number | boolean;

export function layersEventName(event: ProductEvent): string {
  if (event === "account_created") return "sign_up";
  if (event === "signed_in") return "login";
  if (event === "checkout_completed") return "purchase_success";
  return event;
}

export function layersEventProperties(
  properties: Record<string, unknown>,
): Record<string, LayersProperty> {
  const clean: Record<string, LayersProperty> = {};
  for (const [key, value] of Object.entries(properties).slice(0, 40)) {
    if (!/^[a-z$][a-z0-9_$]{0,63}$/i.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, 2_000);
    else if (typeof value === "number" && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === "boolean") clean[key] = value;
    else if (value !== undefined && value !== null) {
      try { clean[key] = JSON.stringify(value).slice(0, 2_000); } catch { /* omit circular values */ }
    }
  }
  return clean;
}
