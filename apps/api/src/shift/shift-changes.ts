import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';
import type { ShiftChangedEvent } from '@vakhta/contracts';

/**
 * Шина змін зміни для SSE оперативного екрана (ТЗ 9.2). Внутрішньопроцесна: панель усе одно
 * перечитує список, а при кількох інстансах API кожен інстанс шле свої події.
 */
@Injectable()
export class ShiftChanges {
  private readonly subject = new Subject<ShiftChangedEvent>();

  publish(event: ShiftChangedEvent): void {
    this.subject.next(event);
  }

  stream(): Observable<ShiftChangedEvent> {
    return this.subject.asObservable();
  }
}
