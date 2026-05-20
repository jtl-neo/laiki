// In-memory tracker for recently-created tx ids per LINE user.
// Used to group sequential image uploads into a Flex carousel.

const TTL_MS = 60_000;
const MAX_ENTRIES = 10;

interface Entry {
  txId: string;
  ts: number;
}

const store = new Map<string, Entry[]>();

function prune(list: Entry[]): Entry[] {
  const cutoff = Date.now() - TTL_MS;
  return list.filter((e) => e.ts >= cutoff);
}

export function pushRecent(userId: string, txId: string): string[] {
  const now = Date.now();
  const existing = store.get(userId) ?? [];
  const pruned = prune(existing);
  pruned.push({ txId, ts: now });
  // Keep only newest MAX_ENTRIES
  const trimmed = pruned.slice(-MAX_ENTRIES);
  store.set(userId, trimmed);
  return trimmed.map((e) => e.txId);
}

export function clear(userId: string): void {
  store.delete(userId);
}
