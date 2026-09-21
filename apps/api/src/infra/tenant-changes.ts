import { Subject, filter, map, type Observable } from 'rxjs';
import { currentTenantOrNull } from './tenant-context.js';

export interface TenantChange<T> {
  readonly tenantId: string | null;
  readonly event: T;
}

/**
 * In-process change bus that remembers which tenant produced an event. `stream()` called inside a
 * request yields only that tenant's events; `streamAll()` is for process-wide subscribers that
 * re-enter the tenant context themselves.
 */
export class TenantChanges<T> {
  private readonly subject = new Subject<TenantChange<T>>();

  publish(event: T): void {
    this.subject.next({ tenantId: currentTenantOrNull()?.tenant.id ?? null, event });
  }

  stream(): Observable<T> {
    const tenantId = currentTenantOrNull()?.tenant.id ?? null;
    return this.subject.asObservable().pipe(
      filter((change) => change.tenantId === tenantId),
      map((change) => change.event),
    );
  }

  streamAll(): Observable<TenantChange<T>> {
    return this.subject.asObservable();
  }
}
