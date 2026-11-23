# Run a project with an AI co-founder

Badger includes two loops. Bo coaches a founder through daily work. Company OS helps operate the project itself. It reads evidence, chooses work for specialist agents, and follows each action through a decision and an outcome. The original project was Badger AI, but the loop can support a different product or business.

## The operating loop

| Step | What happens | Code |
| --- | --- | --- |
| Measure | Collect goals, product events, founder progress and operating signals. | [Metrics](../lib/company-os/metrics.ts), [agent context](../lib/company-os/context.ts) |
| Plan | Choose a daily experiment and turn it into assignments for the agent team. | [Daily plan](../lib/company-os/daily-plan.ts), [work orders](../lib/company-os/work-order.ts) |
| Propose | A scheduled specialist receives its assignment and the available evidence. DeepSeek returns structured recommendations, which the app validates. | [Prompt and output validation](../lib/company-os/analysis.ts), [agent runner](../lib/company-os/runner.ts) |
| Decide | App policy checks the agent’s authority, action type and operating mode. The owner reviews proposals that require approval. | [Policy](../lib/company-os/policy.ts), [decisions](../lib/company-os/decisions.ts) |
| Execute and learn | The scheduler picks up eligible work, records the result and returns it to the dashboard. Metrics and observed experiment results inform later runs. | [Executor](../lib/company-os/executor.ts), [experiment observations](../lib/company-os/experiment-observations.ts) |

The owner dashboard at `/ops/company` shows goals, agent runs, budgets and operating readiness. Its Kanban board groups recent actions into **Needs decision**, **Queued**, **In progress**, **Completed**, and **Closed or failed**. Use the decision cards or the [Telegram integration](telegram.md) to approve or reject work. Board columns follow the stored action status.

## Adapt it to your idea

1. [Deploy your fork](../README.md#deploy-your-fork) with a fresh Supabase project. Enable Google sign-in, set `OWNER_EMAILS`, `DEEPSEEK_API_KEY`, `CRON_SECRET`, and your own `NEXT_PUBLIC_SITE_URL`. Start in **Observe** mode.
2. Set one measurable goal in the dashboard. For a product idea, this could be completed customer interviews. If your goal needs a metric the app does not collect, connect your own events and add the metric to the Company OS definitions.
3. Adapt the agent missions and context to your product. Change the daily plan and assignment rules where you need different work, such as drafting interview questions or summarising trial feedback. Update the policy and executor when adding a new action type.
4. Run one agent from the dashboard. Check its evidence and proposal, then review the action on the board. Enable the scheduled agent and action jobs when you want the loop to continue on a cadence. See [Company OS configuration](BADGER-COMPANY-OS.md) for operating modes and connectors.
5. Enable only the integrations the project needs. You can keep the system in Observe or Guarded mode, or explicitly grant a supported standing mandate in Active mode. The dashboard also exposes the global pause control.

The fork includes Badger-specific starting goals, prompts, and product metrics. Use them as an example when defining what your own co-founder should optimise for.
