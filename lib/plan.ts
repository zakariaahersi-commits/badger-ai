// Back-compat surface. The real engine + startup-builder knowledge base lives in
// planEngine.ts; this re-exports so existing imports keep working.
export {
  TRACK_META,
  WEEK_META,
  TASK_TYPE_META,
  STARTUP_BUILDER_KNOWLEDGE,
  generatePlan,
  buildFallbackPlan,
} from "./planEngine";
