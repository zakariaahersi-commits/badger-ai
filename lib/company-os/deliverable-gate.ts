import type { CompanyActionType } from "./types.ts";

const ONCE_PER_EXPERIMENT = new Set<CompanyActionType>([
  "propose_experiment",
  "draft_campaign",
  "prepare_social_content",
  "create_internal_report",
  "prepare_bug_fix",
]);

export function experimentDeliverableKey(input: {
  experimentId: number | null;
  agentId: string;
  actionType: CompanyActionType;
}): string | null {
  if (!input.experimentId || !ONCE_PER_EXPERIMENT.has(input.actionType)) return null;
  return `company:experiment:${input.experimentId}:${input.agentId}:${input.actionType}`;
}
