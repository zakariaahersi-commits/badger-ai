# Email reminders

1. Verify your own sending domain with Resend and set server-only `RESEND_API_KEY`. Set `NUDGE_FROM` to a sender on that domain and `NEXT_PUBLIC_SITE_URL` to your deployment origin.
2. Configure `CRON_SECRET` and use [the cron schedule](../vercel.json) for the morning and evening editions. The handler checks each founder’s local schedule, access, and notification preferences before attempting delivery.
3. Configure the signed Resend webhook at `/api/resend/webhook` and the email opt-out signing settings described in [the environment example](../.env.example).
4. Test with an account you control. Confirm that reminders respect opt-out settings and that an active iMessage connection does not get the same reminder by email.

[Sending rules](../app/api/nudge/route.ts) · [Message copy](../lib/nudge-copy.ts) · [Schedule calculations](../lib/sprint-calendar.ts)
