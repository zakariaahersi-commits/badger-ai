# Telegram owner alerts and approvals

The Telegram bot sends private Company OS alerts and approval requests. Founder coaching is available in the web app and through the [iPhone Messages integration](imessage-pilot.md).

1. Create your own bot with [@BotFather](https://t.me/BotFather) and start a private chat with it. Obtain the numeric ID of that chat with the bot’s `getUpdates` endpoint before registering the webhook. Keep the bot token private.
2. In the server environment, set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, and a unique `TELEGRAM_WEBHOOK_SECRET` such as the output of `openssl rand -hex 32`. Set `NEXT_PUBLIC_SITE_URL` to your HTTPS origin.
3. Configure Supabase Google sign-in and add your operator email to `OWNER_EMAILS`. Sign in to `/ops/company` and select **Connect Telegram approve / reject buttons**. This registers `/api/telegram/company` on your site.
4. Verify the webhook with the Bot API’s `getWebhookInfo`, then check that a controlled test approval reaches only the configured chat and that its response is reflected in the owner console. [Telegram Bot API](https://core.telegram.org/bots/api)

The [Telegram adapter](../lib/telegram.ts) sends alerts and registers the webhook. The [callback handler](../app/api/telegram/company/route.ts) checks the webhook secret and configured chat before accepting a decision.
