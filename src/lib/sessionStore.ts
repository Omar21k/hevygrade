const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** Returns the same object until the stored string changes, as useSyncExternalStore requires. */
export function readSessionJson<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T | null;
  let value: T | null = null;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = null;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function writeSessionJson(key: string, value: unknown) {
  sessionStorage.setItem(key, JSON.stringify(value));
  notify();
}

export function removeSessionKeys(...keys: string[]) {
  for (const key of keys) sessionStorage.removeItem(key);
  notify();
}
