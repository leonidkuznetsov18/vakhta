import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import type { RequestChangedEvent } from '@vakhta/contracts';

@Injectable()
export class RequestChanges {
  private readonly subject = new Subject<RequestChangedEvent>();

  publish(event: RequestChangedEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<RequestChangedEvent> {
    return this.subject.asObservable();
  }
}
