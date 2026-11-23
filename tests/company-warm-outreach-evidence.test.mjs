import assert from "node:assert/strict";
import test from "node:test";
import { warmOutreachCounts } from "../lib/company-os/warm-outreach.ts";

test("warm outreach outcomes become aggregate learning without recipient data", () => {
  assert.deepEqual(
    warmOutreachCounts(["ready", "sent", "replied", "interested", "not_interested"]),
    { sent: 4, replies: 3, linksShared: 1 },
  );
});
