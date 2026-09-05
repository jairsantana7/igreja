import type { CacheStore } from '../../application/ports/cache-store.port';

export class NoopCacheStore implements CacheStore {
  async get<T>(_key: string): Promise<T | null> { return null; }
  async set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {}
  async delete(_key: string): Promise<void> {}
}
