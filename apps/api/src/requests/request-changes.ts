import { Injectable } from '@nestjs/common';
import type { RequestChangedEvent } from '@vakhta/contracts';
import { TenantChanges } from '../infra/tenant-changes.js';

@Injectable()
export class RequestChanges extends TenantChanges<RequestChangedEvent> {}
