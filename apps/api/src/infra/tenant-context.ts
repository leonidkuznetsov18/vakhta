import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database } from '@vakhta/db';
import type { TenantRuntimeConfig } from '@vakhta/registry';
import type { Auth, AuthConfig } from '../auth/auth.config.js';
import { DomainError } from '../common/domain-error.js';
import type { ShortTermStore } from './short-term-store.js';

/**
 * Per-tenant handles a request or job works with. Built lazily by TenantRuntimeRegistry; the
 * config inside carries decrypted secrets and must never be logged or serialized.
 */
export interface TenantRuntime {
  readonly tenant: TenantRuntimeConfig;
  readonly db: Database;
  readonly auth: Auth;
  readonly authConfig: AuthConfig;
  readonly store: ShortTermStore;
  close(): Promise<void>;
}

const storage = new AsyncLocalStorage<TenantRuntime>();

/** Binds every database, auth, Redis and bot access inside `fn` to one tenant. */
export function runWithTenant<T>(runtime: TenantRuntime, fn: () => T): T {
  return storage.run(runtime, fn);
}

export function currentTenantOrNull(): TenantRuntime | null {
  return storage.getStore() ?? null;
}

/** Fails closed: there is no default tenant to fall back to (spec AC-009). */
export function currentTenant(): TenantRuntime {
  const runtime = storage.getStore();
  if (!runtime) {
    throw new DomainError(
      'TENANT_CONTEXT_MISSING',
      503,
      'No tenant is bound to the current execution context',
    );
  }
  return runtime;
}

/**
 * Property reads that frameworks perform on any object without meaning to use it: Nest's
 * lifecycle-hook discovery, promise resolution checks, inspection and JSON serialization.
 * Outside a tenant context they answer "absent" instead of failing closed.
 */
const INSPECTION_KEYS = new Set<string | symbol>([
  'then',
  'catch',
  'finally',
  'constructor',
  'toJSON',
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
  Symbol.toStringTag,
  Symbol.toPrimitive,
  Symbol.iterator,
  Symbol.asyncIterator,
  Symbol.for('nodejs.util.inspect.custom'),
]);

/**
 * A stand-in object whose every property access resolves the real target at call time. It lets
 * the global `DATABASE`, `AUTH` and `SHORT_TERM_STORE` tokens keep their injection sites while
 * the value behind them follows the current tenant.
 */
export function lateBound<T extends object>(resolve: () => T): T {
  const handler: ProxyHandler<T> = {
    get(_target, property) {
      if (!currentTenantOrNull() && INSPECTION_KEYS.has(property)) return undefined;
      const target = resolve();
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      return (value as (...args: unknown[]) => unknown).bind(target);
    },
    has(_target, property) {
      if (!currentTenantOrNull()) return false;
      return Reflect.has(resolve(), property);
    },
    ownKeys() {
      if (!currentTenantOrNull()) return [];
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, property) {
      if (!currentTenantOrNull()) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), property);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
  };
  return new Proxy(Object.create(null) as T, handler);
}
