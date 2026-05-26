type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

export async function getCached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) return existing.value;

  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function cacheTtlForPeriod(period: string): number {
  if (period === "today") return 30_000;
  if (period === "week") return 90_000;
  if (period === "month") return 180_000;
  if (period === "ytd") return 300_000;
  return 60_000;
}
