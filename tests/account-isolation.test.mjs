import test from "node:test";
import assert from "node:assert/strict";

import {
  LAST_LOCAL_CHANGE_KEY,
  LOCAL_SPRINT_OWNER_KEY,
  LOCAL_SPRINT_STATE_KEY,
  LOCAL_SYNC_SUSPENDED_KEY,
  beginLocalSignOut,
  clearLocalAccountAfterSignOut,
  isLocalSyncSuspended,
  prepareLocalAccount,
} from "../lib/account-isolation.ts";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("the first signed-in account can claim anonymous onboarding", () => {
  const storage = memoryStorage({ [LOCAL_SPRINT_STATE_KEY]: "anonymous-plan" });
  assert.equal(prepareLocalAccount(storage, "user-a"), "claimed");
  assert.equal(storage.getItem(LOCAL_SPRINT_OWNER_KEY), "user-a");
  assert.equal(storage.getItem(LOCAL_SPRINT_STATE_KEY), "anonymous-plan");
});

test("an account switch quarantines the previous founder's local sprint", () => {
  const storage = memoryStorage({
    [LOCAL_SPRINT_OWNER_KEY]: "user-a",
    [LOCAL_SPRINT_STATE_KEY]: "private-founder-state",
    [LAST_LOCAL_CHANGE_KEY]: "123",
  });
  assert.equal(prepareLocalAccount(storage, "user-b"), "reset");
  assert.equal(storage.getItem(LOCAL_SPRINT_OWNER_KEY), "user-b");
  assert.equal(storage.getItem(LOCAL_SPRINT_STATE_KEY), null);
  assert.equal(storage.getItem(LAST_LOCAL_CHANGE_KEY), null);
});

test("sign-out suspends sync and removes all locally identifying state", () => {
  const storage = memoryStorage({
    [LOCAL_SPRINT_OWNER_KEY]: "user-a",
    [LOCAL_SPRINT_STATE_KEY]: "private-founder-state",
  });
  beginLocalSignOut(storage);
  assert.equal(isLocalSyncSuspended(storage), true);
  clearLocalAccountAfterSignOut(storage);
  assert.equal(storage.getItem(LOCAL_SPRINT_OWNER_KEY), null);
  assert.equal(storage.getItem(LOCAL_SPRINT_STATE_KEY), null);
  assert.equal(storage.getItem(LOCAL_SYNC_SUSPENDED_KEY), "1");
});
