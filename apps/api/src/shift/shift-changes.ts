import { Injectable } from '@nestjs/common';
import type { ShiftChangedEvent } from '@vakhta/contracts';
import { TenantChanges } from '../infra/tenant-changes.js';

/**
 * Шина змін зміни для SSE оперативного екрана (ТЗ 9.2). Внутрішньопроцесна: панель усе одно
 * перечитує список, а при кількох інстансах API кожен інстанс шле свої події.
 */
@Injectable()
export class ShiftChanges extends TenantChanges<ShiftChangedEvent> {}
