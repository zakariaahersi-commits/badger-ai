import { revealText } from "./crypto.ts";
import { sendLinqText, startLinqTyping } from "./linq.ts";
import { createSendblueContact, sendSendblueText } from "./sendblue.ts";

export type MessagingProvider = "linq" | "sendblue";

export interface MessagingInboundEvent {
  eventId: string;
  eventType: string;
  chatId: string;
  messageId: string;
  sender: string;
  service: string;
  isGroup: boolean;
  text: string;
  media: { id?: string; url: string; filename?: string; mimeType?: string }[];
}

export function providerConfigured(provider: MessagingProvider): boolean {
  if (provider === "sendblue") {
    return Boolean(
      process.env.SENDBLUE_API_KEY_ID
      && process.env.SENDBLUE_API_SECRET_KEY
      && process.env.SENDBLUE_WEBHOOK_SECRET
      && process.env.SENDBLUE_PHONE_NUMBER,
    );
  }
  return Boolean(process.env.LINQ_API_KEY && process.env.LINQ_WEBHOOK_SECRET && process.env.LINQ_PHONE_NUMBER);
}

export function activeMessagingProvider(): MessagingProvider | null {
  if (providerConfigured("sendblue")) return "sendblue";
  if (providerConfigured("linq")) return "linq";
  return null;
}

export function providerNumber(provider: MessagingProvider): string {
  const value = provider === "sendblue" ? process.env.SENDBLUE_PHONE_NUMBER : process.env.LINQ_PHONE_NUMBER;
  if (!value) throw new Error(`${provider}_phone_not_configured`);
  return value;
}

export async function enrollProviderContact(provider: MessagingProvider, phone: string, firstName?: string): Promise<void> {
  if (provider === "sendblue") await createSendblueContact(phone, firstName);
}

export async function sendProviderText(
  provider: MessagingProvider,
  target: string,
  value: string,
  idempotencyKey: string,
): Promise<{ messageId?: string }> {
  return provider === "sendblue"
    ? sendSendblueText(target, value)
    : sendLinqText(target, value, idempotencyKey);
}

export async function startProviderTyping(provider: MessagingProvider, target: string): Promise<void> {
  if (provider === "linq") await startLinqTyping(target);
}

export function outboundTarget(channel: { provider: MessagingProvider; provider_chat_id: string; phone_ciphertext?: string | null }): string {
  if (channel.provider === "linq") return channel.provider_chat_id;
  if (!channel.phone_ciphertext) throw new Error("sendblue_phone_unavailable");
  return revealText(channel.phone_ciphertext);
}

export function inboundReplyTarget(provider: MessagingProvider, event: Pick<MessagingInboundEvent, "chatId" | "sender">): string {
  // Linq's follow-up endpoint is scoped to the inbound chat UUID. Sendblue's
  // endpoint addresses the participant by phone number.
  return provider === "linq" ? event.chatId : event.sender;
}
