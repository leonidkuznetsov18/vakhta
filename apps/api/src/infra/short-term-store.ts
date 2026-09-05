import type { Redis } from 'ioredis';

/**
 * Короткоживучі значення з TTL: лічильники спроб, очікування підтвердження.
 * Порт із двома реалізаціями: Redis у runtime, памʼять у тестах.
 */
export interface ShortTermStore {
  /** Збільшує лічильник; TTL ставиться при першому інкременті. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export const SHORT_TERM_STORE = Symbol('SHORT_TERM_STORE');

export class RedisShortTermStore implements ShortTermStore {
  constructor(private readonly redis: Redis) {}

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const n = await this.redis.incr(key);
    if (n === 1) await this.redis.expire(key, ttlSeconds);
    return n;
  }

  get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

export class InMemoryShortTermStore implements ShortTermStore {
  private readonly items = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private live(key: string): { value: string; expiresAt: number } | null {
    const item = this.items.get(key);
    if (!item) return null;
    if (item.expiresAt <= this.now()) {
      this.items.delete(key);
      return null;
    }
    return item;
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const item = this.live(key);
    const next = item ? Number(item.value) + 1 : 1;
    this.items.set(key, {
      value: String(next),
      expiresAt: item ? item.expiresAt : this.now() + ttlSeconds * 1000,
    });
    return next;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.items.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.items.delete(key);
  }
}
