import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import type { IncidentChangedEvent } from '@vakhta/contracts';

/** Шина змін інцидентів для SSE екрана майстра (ТЗ 9.1 «Простои и инциденты»). */
@Injectable()
export class IncidentChanges {
  private readonly subject = new Subject<IncidentChangedEvent>();

  publish(event: IncidentChangedEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<IncidentChangedEvent> {
    return this.subject.asObservable();
  }
}
