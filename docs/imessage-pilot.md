# Chat with Bo on iPhone

## Set up your instance

1. Deploy the app with HTTPS, set `NEXT_PUBLIC_SITE_URL`, and apply the Supabase migrations, including `20260818204251_add_imessage_pilot.sql`.
2. Choose one provider. **Sendblue** takes precedence when both providers are configured.
   - **Sendblue:** Set `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET_KEY`, `SENDBLUE_WEBHOOK_SECRET`, and `SENDBLUE_PHONE_NUMBER`. Register the inbound webhook at `https://YOUR_HOST/api/messaging/sendblue/webhook` with the same signing secret. [Sendblue webhook security](https://docs.sendblue.com/security/)
   - **Linq:** Set `LINQ_API_KEY`, `LINQ_WEBHOOK_SECRET`, and `LINQ_PHONE_NUMBER`. Register `https://YOUR_HOST/api/messaging/linq/webhook?version=2026-02-03` for `message.received`, `message.delivered`, `message.read`, and `message.failed`.
3. Generate a unique 32-byte key for `MESSAGING_DATA_KEY`, for example with `openssl rand -hex 32`. Keep it on the server. The app uses it to encrypt phone numbers and hash link codes.
4. Use a signed-in founder account with an active payment or tester entitlement. Open `/app` on iPhone, go to **Today**, and use the iMessage connection card. With Sendblue, enter the iPhone number when asked. Tap the generated **Open iMessage and send** link and send `START <code>` from that iPhone within 15 minutes.
5. Reply normally or test `TODAY`, `STUCK`, `DONE`, `PAUSE`, `RESUME`, and `STOP`. Use a controlled tester account before enabling proactive messages. An expired code can be regenerated from Today.

The [connection route](../app/api/messaging/link/route.ts) builds the Messages link using the number from your deployment. The [messaging service](../lib/messaging/service.ts) handles incoming text and calls the shared coach.
