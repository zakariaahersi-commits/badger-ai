# Badger AI

**Build an AI co-founder that helps operate your project, or fork the coaching loop into a habit tracker.**

Badger helps people go from a business idea to something they can test in 28 days. Bo, the coach, gives them one task at a time, asks what happened, and helps choose the next step. Checkpoints on Days 14 and 28 help them decide whether to continue, change direction, or stop.

Company OS is the operating side. Specialist agents read product evidence, choose a daily experiment, propose work, and execute actions within the authority you give them. The owner dashboard and Kanban board show what needs a decision, what is running, and what happened. [Set up a co-founder for your own idea](docs/self-running-cofounder.md).

The coaching loop also works for a writing habit, customer research, or a personal project. Fork the project and change the tasks, the evidence you ask people to log, and the way Bo responds.

| Feature | Where to start |
| --- | --- |
| Web app | [/start](http://localhost:3000/start) for onboarding and [/app](http://localhost:3000/app) for the plan, coach, and progress |
| Coach and plan | [Shared coach service](lib/coach-service.ts) and [calendar rules](lib/sprint-calendar.ts) |
| iPhone Messages | [Connect Sendblue or Linq](docs/imessage-pilot.md) |
| Telegram | [Connect private owner alerts and approval buttons](docs/telegram.md) |
| Email | [Configure Resend and scheduled reminders](docs/email.md) |
| Self-running co-founder | [Operating loop and Kanban board](docs/self-running-cofounder.md) |

## Run locally

Use Node.js 22 or later and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open [localhost:3000/start](http://localhost:3000/start). Start with local demo mode and add `DEEPSEEK_API_KEY` if you want model-backed coaching. The app also has a deterministic coaching fallback.

## Deploy your fork

1. Create a fresh Supabase project. Apply [the schema](supabase/schema.sql) and the [migrations](supabase/migrations/) before enabling cloud features. Use a new database for the fork.
2. Configure Supabase Auth and set your own site origin in `NEXT_PUBLIC_SITE_URL`. Use HTTPS for deployed webhooks and configure the appropriate Supabase redirect URLs.
3. Set server credentials in your deployment environment. [The example environment file](.env.example) lists the integrations. Configure Stripe test mode or grant tester access when verifying flows that require an active entitlement.
4. Use [the cron schedule](vercel.json) as a reference. Provision only the jobs and connectors you intend to use. Review the hosted terms and privacy pages for your deployment before inviting users.

## How it fits together

The Next.js app uses React, Zustand, and Supabase. Web chat and iPhone Messages share the coaching service, so both work from the same sprint context. iPhone connects through a one-time code and a provider webhook. The reminder job checks the founder’s local schedule and sends through an enabled channel. Telegram has a separate use case on the owner side, where a single allowlisted chat receives operational alerts and can respond to approval requests.

```sh
npm run lint
npm run test:coach
npm run build
npx playwright install chromium
npm run test:e2e
```

## License

See [LICENSE](LICENSE) for the MIT license. Third-party dependencies retain their own licenses.
