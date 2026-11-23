import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

function decodeKey(value = process.env.MESSAGING_DATA_KEY ?? ""): Buffer {
  const trimmed = value.trim();
  const key = /^[a-f0-9]{64}$/i.test(trimmed)
    ? Buffer.from(trimmed, "hex")
    : Buffer.from(trimmed, "base64");
  if (key.length !== 32) throw new Error("MESSAGING_DATA_KEY must contain exactly 32 bytes");
  return key;
}

export function messagingConfigured(): boolean {
  try {
    decodeKey();
    const sendblue = Boolean(process.env.SENDBLUE_API_KEY_ID && process.env.SENDBLUE_API_SECRET_KEY && process.env.SENDBLUE_WEBHOOK_SECRET && process.env.SENDBLUE_PHONE_NUMBER);
    const linq = Boolean(process.env.LINQ_API_KEY && process.env.LINQ_WEBHOOK_SECRET && process.env.LINQ_PHONE_NUMBER);
    return sendblue || linq;
  } catch {
    return false;
  }
}

export function protectText(value: string, keyValue?: string): string {
  const key = decodeKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function revealText(value: string, keyValue?: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) throw new Error("invalid protected value");
  const decipher = createDecipheriv("aes-256-gcm", decodeKey(keyValue), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function privateDigest(value: string, keyValue?: string): string {
  return createHmac("sha256", decodeKey(keyValue)).update(value.trim()).digest("hex");
}

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateLinkCode(bytes = randomBytes(6)): string {
  return Array.from(bytes.subarray(0, 6), (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export function normalizePhone(value: string): string | null {
  const cleaned = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}

export function bodyLengthBucket(length: number): "0" | "1-40" | "41-160" | "161-500" | "501+" {
  if (length <= 0) return "0";
  if (length <= 40) return "1-40";
  if (length <= 160) return "41-160";
  if (length <= 500) return "161-500";
  return "501+";
}
