import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import type { HandoverChangedEvent } from '@vakhta/contracts';

/** Шина змін передач для SSE панелі «Чистота и передача». */
@Injectable()
export class HandoverChanges {
  private readonly subject = new Subject<HandoverChangedEvent>();

  publish(event: HandoverChangedEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<HandoverChangedEvent> {
    return this.subject.asObservable();
  }
}
