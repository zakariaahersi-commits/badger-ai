import test from "node:test";
import assert from "node:assert/strict";

import { assignmentForAgent, buildCompanyDailyWorkOrder, workOrderAllowsAction } from "../lib/company-os/work-order.ts";

function plan(channel) {
  return {
    objective: "Move from two to three genuinely paid founders.",
    company_experiments: [{ title: "Show Bo following up", channel, source_code: `badger-20260819-${channel}` }],
  };
}

test("a product experiment becomes one coordinated specialist work order", () => {
  const workOrder = buildCompanyDailyWorkOrder(plan("product"));
  assert.equal(workOrder?.channel, "product");
  assert.equal(workOrder?.trackingUrl, "https://badger.example.com/start?utm_source=badger_company_os&utm_medium=product&utm_campaign=badger-20260819-product");
  assert.deepEqual(workOrder?.assignments.map((item) => item.agentId), ["ceo", "growth", "qa", "engineering"]);
  assert.match(workOrder?.assignments.find((item) => item.agentId === "growth")?.deliverable ?? "", /single-variable funnel experiment/i);
});

test("an Instagram experiment assigns growth, content and revenue without waking unrelated agents", () => {
  const workOrder = buildCompanyDailyWorkOrder(plan("instagram"));
  assert.deepEqual(workOrder?.assignments.map((item) => item.agentId), ["ceo", "growth", "content", "revenue"]);
  assert.equal(assignmentForAgent(workOrder, "customer_success")?.assigned, false);
  assert.equal(assignmentForAgent(workOrder, "content")?.assigned, true);
  assert.match(assignmentForAgent(workOrder, "content")?.trackingUrl ?? "", /utm_campaign=badger-20260819-instagram/);
  assert.deepEqual(assignmentForAgent(workOrder, "growth")?.actionTypes, ["propose_experiment"]);
});

test("a social experiment assigns prepared X and TikTok work while excluding LinkedIn publishing", () => {
  const workOrder = buildCompanyDailyWorkOrder(plan("social"));
  const content = assignmentForAgent(workOrder, "content");
  assert.equal(workOrder?.channel, "social");
  assert.match(content?.trackingUrl ?? "", /utm_medium=social/);
  assert.deepEqual(content?.actionTypes, ["prepare_social_content"]);
  assert.deepEqual(assignmentForAgent(workOrder, "growth")?.actionTypes, ["propose_experiment"]);
  assert.match(content?.deliverable ?? "", /LinkedIn content/i);
  assert.equal(workOrderAllowsAction(content, "publish_social_content", "healthy"), false);
});

test("work-order validation rejects disconnected output but preserves critical escalation", () => {
  const assignment = assignmentForAgent(buildCompanyDailyWorkOrder(plan("instagram")), "content");
  assert.equal(workOrderAllowsAction(assignment, "draft_campaign", "healthy"), true);
  assert.equal(workOrderAllowsAction(assignment, "prepare_bug_fix", "healthy"), false);
  const unassigned = assignmentForAgent(buildCompanyDailyWorkOrder(plan("instagram")), "engineering");
  assert.equal(workOrderAllowsAction(unassigned, "prepare_bug_fix", "watch"), false);
  assert.equal(workOrderAllowsAction(unassigned, "send_owner_alert", "critical"), true);
});

test("unknown channels stay bounded to the generic acquisition workflow", () => {
  const workOrder = buildCompanyDailyWorkOrder(plan("podcast"));
  assert.equal(workOrder?.channel, "other");
  assert.deepEqual(workOrder?.assignments.map((item) => item.agentId), ["ceo", "growth", "content", "revenue"]);
});

test("warm messages are a five-person owner-delivered experiment", () => {
  const workOrder = buildCompanyDailyWorkOrder(plan("warm_dm"));
  assert.equal(workOrder?.channel, "warm_dm");
  assert.match(workOrder?.assignments.find((item) => item.agentId === "growth")?.deliverable ?? "", /five-person warm-message test/i);
  assert.deepEqual(workOrder?.assignments.find((item) => item.agentId === "growth")?.actionTypes, ["propose_experiment"]);
  assert.ok(!workOrder?.assignments.some((item) => item.agentId === "content"));
  assert.ok(!workOrder?.assignments.some((item) => item.agentId === "engineering"));
});

test("a won experiment closes its specialist work order", () => {
  const order = buildCompanyDailyWorkOrder({
    objective: "Earn five genuine starts.",
    experiment: { title: "Five clean starts", status: "won", channel: "other", source_code: "badger-20260821-other" },
  });
  assert.equal(order, null);
});
