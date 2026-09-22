import { Inject, Injectable } from '@nestjs/common';
import { JobStatus, ProvisioningKind, TenantStatus } from '@vakhta/domain';
import {
  and,
  desc,
  eq,
  inArray,
  provisioningJobs,
  sql,
  tenants,
  type RegistryDatabase,
  type SecretCipher,
} from '@vakhta/registry';
import type { ProvisioningJobView } from '@vakhta/contracts';
import { ControlAudit } from '../audit/audit.service.js';
import type { Operator } from '../auth/operator.guard.js';
import { ControlError } from '../common/domain-error.js';
import type { ControlEnv } from '../config/env.js';
import { CONTROL_ENV, REGISTRY, SECRET_CIPHER } from '../infra/registry.module.js';
import { ProvisioningService } from '../provisioning/provisioning.service.js';
import { lockTenant } from '../provisioning/tenant-lock.js';
import { deletionStorageScopes } from '../provisioning/steps/delete-storage.js';
import { deletionDatabase } from './deletion-target.js';

@Injectable()
export class TenantDeletionService {
  constructor(
    @Inject(REGISTRY) private readonly db: RegistryDatabase,
    @Inject(SECRET_CIPHER) private readonly cipher: SecretCipher,
    @Inject(CONTROL_ENV) private readonly env: ControlEnv,
    private readonly audit: ControlAudit,
    private readonly provisioning: ProvisioningService,
  ) {}

  async remove(tenantId: string, reason: string, actor: Operator): Promise<ProvisioningJobView> {
    const jobId = await this.db.transaction(async (tx) => {
      if (!(await lockTenant(tx, tenantId)))
        throw new ControlError('TENANT_BUSY', 409, 'Tenant operation is in progress');
      const [tenant] = await tx
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .for('update');
      if (!tenant) throw new ControlError('TENANT_NOT_FOUND', 404, 'Tenant not found');
      const [existing] = await tx
        .select()
        .from(provisioningJobs)
        .where(
          and(
            eq(provisioningJobs.tenantId, tenantId),
            eq(provisioningJobs.kind, ProvisioningKind.DELETE),
          ),
        )
        .orderBy(desc(provisioningJobs.createdAt))
        .limit(1);
      if (existing) return existing.id;
      await deletionStorageScopes({ tenant, db: tx });
      const database = await deletionDatabase({ tenant, db: tx, cipher: this.cipher }, this.env);
      await tx
        .update(provisioningJobs)
        .set({ status: JobStatus.CANCELLED, finishedAt: new Date() })
        .where(
          and(
            eq(provisioningJobs.tenantId, tenantId),
            inArray(provisioningJobs.status, [
              JobStatus.PENDING,
              JobStatus.RUNNING,
              JobStatus.FAILED,
            ]),
          ),
        );
      await tx
        .update(tenants)
        .set({
          status: TenantStatus.ARCHIVED,
          suspendedAt: null,
          suspendedReason: null,
          updatedAt: sql`now()`,
        })
        .where(eq(tenants.id, tenantId));
      const id = await this.provisioning.createJob(tx, {
        tenantId,
        kind: ProvisioningKind.DELETE,
        requestedBy: actor.id,
        modules: [],
        payload: { database },
      });
      await this.audit.record(tx, {
        actor,
        action: 'tenant.delete',
        tenantId,
        objectType: 'tenant',
        objectId: tenantId,
        before: { status: tenant.status },
        after: { status: TenantStatus.ARCHIVED, reason, jobId: id },
      });
      return id;
    });
    return this.provisioning.get(jobId);
  }
}
