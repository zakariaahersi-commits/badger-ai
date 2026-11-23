import { safeCompanyWebhook } from "./execution-policy.ts";

const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

function validGitHubRepository(value: string): boolean {
  if (!GITHUB_REPOSITORY.test(value) || value.includes("..")) return false;
  return value.split("/").every((part) => part !== "." && part !== "..");
}

export type EngineeringConnector =
  | { provider: "github"; repository: string; workerSecret: string; callbackSecret: string; site: URL }
  | { provider: "webhook"; webhook: URL; secret: string }
  | null;

function githubConnector(env: NodeJS.ProcessEnv): EngineeringConnector {
  const repository = (env.COMPANY_ENGINEERING_GITHUB_REPOSITORY || env.GITHUB_REPOSITORY || "").trim();
  const workerSecret = env.COMPANY_ENGINEERING_WORKER_SECRET?.trim() ?? "";
  const callbackSecret = env.COMPANY_AUTOMATION_CALLBACK_SECRET?.trim() ?? "";
  const site = safeCompanyWebhook(env.NEXT_PUBLIC_SITE_URL?.trim() || "https://badger.example.com");
  if (!repository && !workerSecret) return null;
  if (!validGitHubRepository(repository) || workerSecret.length < 32 || callbackSecret.length < 24 || !site) return null;
  return { provider: "github", repository, workerSecret, callbackSecret, site };
}

export function engineeringConnector(env: NodeJS.ProcessEnv = process.env): EngineeringConnector {
  const github = githubConnector(env);
  if (github) return github;
  if (env.COMPANY_ENGINEERING_GITHUB_REPOSITORY || env.GITHUB_REPOSITORY || env.COMPANY_ENGINEERING_WORKER_SECRET) return null;

  const webhookValue = env.COMPANY_ENGINEERING_WEBHOOK_URL?.trim() ?? "";
  const webhookSecret = env.COMPANY_ENGINEERING_WEBHOOK_SECRET?.trim() ?? "";
  if (webhookValue || webhookSecret) {
    const webhook = safeCompanyWebhook(webhookValue);
    return webhook && webhookSecret.length >= 16 ? { provider: "webhook", webhook, secret: webhookSecret } : null;
  }
  return null;
}

export function engineeringConnectorProvider(env: NodeJS.ProcessEnv = process.env): "github" | "webhook" | null {
  return engineeringConnector(env)?.provider ?? null;
}
