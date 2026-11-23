import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function engineeringActionToken(actionId: string, secret: string): string {
  if (!UUID.test(actionId) || secret.trim().length < 24) throw new Error("invalid_engineering_action_token_config");
  return createHmac("sha256", secret.trim()).update(`badger-engineering:${actionId}`).digest("base64url");
}

export function verifyEngineeringActionToken(actionId: string, supplied: string, secret: string): boolean {
  try {
    const expected = Buffer.from(engineeringActionToken(actionId, secret));
    const actual = Buffer.from(supplied.trim());
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function verifyEngineeringWorkerSecret(supplied: string, expected: string): boolean {
  try {
    if (expected.trim().length < 32) return false;
    const expectedBytes = Buffer.from(expected.trim());
    const suppliedBytes = Buffer.from(supplied.trim());
    return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
  } catch {
    return false;
  }
}
