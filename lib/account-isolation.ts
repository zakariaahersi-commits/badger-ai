// Local sprint state is deliberately claimed by one authenticated account at
// a time. This prevents a founder who signs in after somebody else on a shared
// browser from inheriting or uploading the previous founder's private work.

export const LOCAL_SPRINT_STATE_KEY = "bygga-v1";
export const LOCAL_SPRINT_OWNER_KEY = "badger-local-state-owner-v1";
export const LAST_LOCAL_CHANGE_KEY = "bygga-last-local-change";
export const LOCAL_SYNC_SUSPENDED_KEY = "badger-local-sync-suspended";

type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type LocalOwnershipResult = "owned" | "claimed" | "reset";

export function prepareLocalAccount(storage: LocalStorageLike, userId: string): LocalOwnershipResult {
  const owner = storage.getItem(LOCAL_SPRINT_OWNER_KEY);
  storage.removeItem(LOCAL_SYNC_SUSPENDED_KEY);
  if (!owner) {
    storage.setItem(LOCAL_SPRINT_OWNER_KEY, userId);
    return "claimed";
  }
  if (owner === userId) return "owned";

  storage.removeItem(LOCAL_SPRINT_STATE_KEY);
  storage.removeItem(LAST_LOCAL_CHANGE_KEY);
  storage.setItem(LOCAL_SPRINT_OWNER_KEY, userId);
  return "reset";
}

export function beginLocalSignOut(storage: LocalStorageLike) {
  storage.setItem(LOCAL_SYNC_SUSPENDED_KEY, "1");
}

export function cancelLocalSignOut(storage: LocalStorageLike) {
  storage.removeItem(LOCAL_SYNC_SUSPENDED_KEY);
}

export function clearLocalAccountAfterSignOut(storage: LocalStorageLike) {
  storage.removeItem(LOCAL_SPRINT_STATE_KEY);
  storage.removeItem(LOCAL_SPRINT_OWNER_KEY);
  storage.removeItem(LAST_LOCAL_CHANGE_KEY);
  // Keep sync suspended until the next authenticated account is prepared.
}

export function isLocalSyncSuspended(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(LOCAL_SYNC_SUSPENDED_KEY) === "1";
}
