import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  equipment,
  equipmentDocumentLinks,
  equipmentDocuments,
  inArray,
  isNull,
  maintenancePlanMaterials,
  maintenancePlanOperations,
  maintenancePlanVersions,
  maintenancePlans,
  max,
  notInArray,
  sites,
  sql,
  workOrders,
  type Database,
  type Transaction,
} from '@vakhta/db';
import type { PlanContent, PlanDetail, PlanIssue, PlanRow } from '@vakhta/contracts';
import {
  AnchorMode,
  FINAL_WORK_STATUSES,
  IntervalUnit,
  PlanSourceKind,
  PlanState,
  WorkStatus,
  WorkType,
} from '@vakhta/domain';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { textOrNull } from '../common/text.js';
import { AuditLog } from '../events/audit-log.js';
import { EventStore } from '../events/event-store.js';
import { DATABASE } from '../infra/database.module.js';
import { maintenanceStaff } from './lookups.js';
import { MaintenanceScheduler } from './maintenance-scheduler.js';

type VersionRow = typeof maintenancePlanVersions.$inferSelect;
type PlanDb = typeof maintenancePlans.$inferSelect;

const FINAL = [...FINAL_WORK_STATUSES];

/** Every plan is created with a draft version; this only covers a row read mid-creation. */
const NO_VERSION_RULE = {
  intervalUnit: IntervalUnit.MONTH,
  intervalCount: 1,
  anchorMode: AnchorMode.FROM_COMPLETION,
} as const;

interface PlanFacts {
  readonly version: VersionRow | undefined;
  readonly openWork:
    { readonly dueOn: string | null; readonly readiness: PlanRow['readiness'] } | undefined;
  readonly performedOn: string | null;
  readonly sourceLabel: string;
}

function planRow(plan: PlanDb, facts: PlanFacts): PlanRow {
  const rule = facts.version ?? NO_VERSION_RULE;
  return {
    id: plan.id,
    title: plan.title,
    state: plan.state,
    intervalUnit: rule.intervalUnit,
    intervalCount: rule.intervalCount,
    anchorMode: rule.anchorMode,
    lastPerformedOn: facts.performedOn,
    nextDueOn: facts.openWork?.dueOn ?? null,
    readiness: facts.openWork?.readiness ?? null,
    sourceLabel: facts.sourceLabel,
    hasDraft: facts.version?.publishedAt === null,
  };
}

/** A copy keeps the work content and drops what must be confirmed for the new machine. */
function copiedDraft(content: PlanContent): PlanContent {
  return {
    ...content,
    firstDueOn: null,
    sourceDocumentId: null,
    sourceNote: undefined,
    assigneeEmployeeId: null,
  };
}

export interface ReassignInput {
  readonly equipmentId: string;
  readonly employeeId: string;
  readonly actor: Actor;
  readonly now: Date;
}

/** Maintenance plans from the manual (spec 014, US3): drafts, versions and publication. */
@Injectable()
export class PlansService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly audit: AuditLog,
    private readonly events: EventStore,
    private readonly scheduler: MaintenanceScheduler,
  ) {}

  async forEquipment(equipmentId: string): Promise<PlanRow[]> {
    const plans = await this.db
      .select()
      .from(maintenancePlans)
      .where(eq(maintenancePlans.equipmentId, equipmentId))
      .orderBy(asc(maintenancePlans.title));
    if (!plans.length) return [];
    const ids = plans.map((plan) => plan.id);
    const [versions, open, last, docs] = await Promise.all([
      this.latestVersions(ids),
      this.db
        .select({
          planId: workOrders.planId,
          dueOn: workOrders.dueOn,
          readiness: workOrders.readiness,
        })
        .from(workOrders)
        .where(and(inArray(workOrders.planId, ids), notInArray(workOrders.status, FINAL))),
      this.db
        // The site's calendar day of the latest completion, not the UTC one.
        .select({
          planId: workOrders.planId,
          performedOn: sql<
            string | null
          >`max((${workOrders.performedAt} AT TIME ZONE ${sites.timezone})::date)::text`,
        })
        .from(workOrders)
        .innerJoin(equipment, eq(equipment.id, workOrders.equipmentId))
        .innerJoin(sites, eq(sites.id, equipment.siteId))
        .where(and(inArray(workOrders.planId, ids), eq(workOrders.status, WorkStatus.COMPLETED)))
        .groupBy(workOrders.planId),
      this.documentTitles(),
    ]);
    const openBy = new Map(open.map((row) => [row.planId, row]));
    const lastBy = new Map(last.map((row) => [row.planId, row.performedOn]));
    return plans.map((plan) => {
      const version = versions.get(plan.id);
      return planRow(plan, {
        version,
        openWork: openBy.get(plan.id),
        performedOn: lastBy.get(plan.id) ?? null,
        sourceLabel: this.sourceLabel(version, docs),
      });
    });
  }

  private sourceLabel(version: VersionRow | undefined, docs: Map<string, string>): string {
    if (!version) return '';
    if (version.sourceKind === PlanSourceKind.DOCUMENT && version.sourceDocumentId)
      return [docs.get(version.sourceDocumentId), version.sourceReference]
        .filter(Boolean)
        .join(', ');
    return version.sourceNote ?? '';
  }

  private async documentTitles(): Promise<Map<string, string>> {
    const rows = await this.db
      .select({ id: equipmentDocuments.id, title: equipmentDocuments.title })
      .from(equipmentDocuments);
    return new Map(rows.map((row) => [row.id, row.title]));
  }

  /** The newest version of each plan, a draft if there is one. */
  private async latestVersions(planIds: readonly string[]): Promise<Map<string, VersionRow>> {
    const rows = await this.db
      .selectDistinctOn([maintenancePlanVersions.planId])
      .from(maintenancePlanVersions)
      .where(inArray(maintenancePlanVersions.planId, [...planIds]))
      .orderBy(maintenancePlanVersions.planId, desc(maintenancePlanVersions.revision));
    return new Map(rows.map((row) => [row.planId, row]));
  }

  async equipmentOf(planId: string): Promise<string> {
    const [plan] = await this.db
      .select({ equipmentId: maintenancePlans.equipmentId })
      .from(maintenancePlans)
      .where(eq(maintenancePlans.id, planId));
    if (!plan) throw new DomainError('PLAN_NOT_FOUND', 404, 'Plan not found');
    return plan.equipmentId;
  }

  private async content(version: VersionRow, plan: PlanDb): Promise<PlanContent> {
    const [operations, materials] = await Promise.all([
      this.db
        .select()
        .from(maintenancePlanOperations)
        .where(eq(maintenancePlanOperations.versionId, version.id))
        .orderBy(asc(maintenancePlanOperations.ordinal)),
      this.db
        .select()
        .from(maintenancePlanMaterials)
        .where(eq(maintenancePlanMaterials.versionId, version.id))
        .orderBy(asc(maintenancePlanMaterials.ordinal)),
    ]);
    return {
      title: plan.title,
      intervalUnit: version.intervalUnit,
      intervalCount: version.intervalCount,
      anchorMode: version.anchorMode,
      firstDueOn: plan.firstDueOn,
      sourceKind: version.sourceKind,
      sourceDocumentId: version.sourceDocumentId,
      sourceReference: version.sourceReference ?? undefined,
      sourceNote: version.sourceNote ?? undefined,
      estimatedMinutes: version.estimatedMinutes,
      requiresStop: version.requiresStop,
      assigneeEmployeeId: version.assigneeEmployeeId,
      operations: operations.map((o) => ({
        text: o.text,
        place: o.place ?? undefined,
        photoRequired: o.photoRequired,
      })),
      materials: materials.map((m) => ({
        kind: m.kind,
        name: m.name,
        article: m.article ?? undefined,
        quantity: Number(m.quantity),
        unit: m.unit,
        mode: m.mode,
      })),
    };
  }

  async detail(planId: string): Promise<PlanDetail> {
    const [plan] = await this.db
      .select()
      .from(maintenancePlans)
      .where(eq(maintenancePlans.id, planId));
    if (!plan) throw new DomainError('PLAN_NOT_FOUND', 404, 'Plan not found');
    const versions = await this.db
      .select()
      .from(maintenancePlanVersions)
      .where(eq(maintenancePlanVersions.planId, planId))
      .orderBy(desc(maintenancePlanVersions.revision));
    const active = versions.find((v) => v.id === plan.activeVersionId);
    const draft = versions.find((v) => !v.publishedAt);
    return {
      id: plan.id,
      equipmentId: plan.equipmentId,
      state: plan.state,
      stateReason: plan.stateReason,
      active: active ? await this.content(active, plan) : null,
      activeRevision: active?.revision ?? null,
      draft: draft ? await this.content(draft, plan) : null,
      version: plan.version,
    };
  }

  private async writeContent(tx: Transaction, versionId: string, content: PlanContent) {
    await tx
      .delete(maintenancePlanOperations)
      .where(eq(maintenancePlanOperations.versionId, versionId));
    await tx
      .delete(maintenancePlanMaterials)
      .where(eq(maintenancePlanMaterials.versionId, versionId));
    if (content.operations.length)
      await tx.insert(maintenancePlanOperations).values(
        content.operations.map((o, index) => ({
          versionId,
          ordinal: index + 1,
          text: o.text,
          place: textOrNull(o.place),
          photoRequired: o.photoRequired,
        })),
      );
    if (content.materials.length)
      await tx.insert(maintenancePlanMaterials).values(
        content.materials.map((m, index) => ({
          versionId,
          ordinal: index + 1,
          kind: m.kind,
          name: m.name,
          article: textOrNull(m.article),
          quantity: String(m.quantity),
          unit: m.unit,
          mode: m.mode,
        })),
      );
  }

  /** Columns of a version row; a draft may be incomplete until it is published (FR-022). */
  private versionValues(content: PlanContent) {
    const plantDecision = content.sourceKind === PlanSourceKind.PLANT_DECISION;
    return {
      intervalUnit: content.intervalUnit,
      intervalCount: content.intervalCount,
      anchorMode: content.anchorMode,
      sourceKind: content.sourceKind,
      sourceDocumentId: plantDecision ? null : content.sourceDocumentId,
      sourceReference: textOrNull(content.sourceReference),
      sourceNote: textOrNull(content.sourceNote),
      estimatedMinutes: content.estimatedMinutes,
      requiresStop: content.requiresStop,
      assigneeEmployeeId: content.assigneeEmployeeId,
    };
  }

  private async responsibleOf(tx: Transaction, equipmentId: string): Promise<string> {
    const [row] = await tx
      .select({ id: equipment.responsibleEmployeeId })
      .from(equipment)
      .where(eq(equipment.id, equipmentId));
    if (!row) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    return row.id;
  }

  async create(equipmentId: string, content: PlanContent, actor: Actor): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const responsible = await this.responsibleOf(tx, equipmentId);
      return this.insertPlan(tx, {
        equipmentId,
        content: { ...content, assigneeEmployeeId: content.assigneeEmployeeId ?? responsible },
        actor,
        copiedFrom: null,
      });
    });
  }

  private async insertPlan(
    tx: Transaction,
    input: {
      readonly equipmentId: string;
      readonly content: PlanContent;
      readonly actor: Actor;
      readonly copiedFrom: string | null;
    },
  ): Promise<{ id: string }> {
    const { equipmentId, content, actor } = input;
    const values = this.versionValues(content);
    const [plan] = await tx
      .insert(maintenancePlans)
      .values({
        equipmentId,
        title: content.title,
        firstDueOn: content.firstDueOn,
        createdBy: actor.id ?? 'system',
      })
      .returning({ id: maintenancePlans.id });
    if (!plan) throw new Error('maintenance_plans: insert returned no row');
    const [version] = await tx
      .insert(maintenancePlanVersions)
      .values({ planId: plan.id, revision: 1, ...values })
      .returning({ id: maintenancePlanVersions.id });
    if (!version) throw new Error('maintenance_plan_versions: insert returned no row');
    await this.writeContent(tx, version.id, content);
    await this.audit.record(tx, {
      actor,
      action: input.copiedFrom ? 'maintenance_plan.copy' : 'maintenance_plan.create',
      objectType: 'maintenance_plan',
      objectId: plan.id,
      after: { equipmentId, title: content.title, copiedFrom: input.copiedFrom },
    });
    return { id: plan.id };
  }

  /**
   * Copies a plan to another machine as a draft (FR-026, AC-018): operations, materials and the
   * rule carry over; the first date, the source's validity and the mechanic must be confirmed.
   */
  async copy(planId: string, targetEquipmentId: string, actor: Actor): Promise<{ id: string }> {
    const [plan] = await this.db
      .select()
      .from(maintenancePlans)
      .where(eq(maintenancePlans.id, planId));
    if (!plan) throw new DomainError('PLAN_NOT_FOUND', 404, 'Plan not found');
    if (plan.equipmentId === targetEquipmentId)
      throw new DomainError('PLAN_COPY_SAME_EQUIPMENT', 422, 'Copy to another machine');
    const [target] = await this.db
      .select({ archivedAt: equipment.archivedAt })
      .from(equipment)
      .where(eq(equipment.id, targetEquipmentId));
    if (!target) throw new DomainError('EQUIPMENT_NOT_FOUND', 404, 'Equipment not found');
    if (target.archivedAt)
      throw new DomainError('EQUIPMENT_ARCHIVED', 409, 'The machine is archived');
    const [latest] = await this.db
      .select()
      .from(maintenancePlanVersions)
      .where(eq(maintenancePlanVersions.planId, planId))
      .orderBy(desc(maintenancePlanVersions.revision))
      .limit(1);
    const source = plan.activeVersionId ? await this.versionRow(plan.activeVersionId) : latest;
    if (!source) throw new DomainError('PLAN_NOT_FOUND', 404, 'Plan has no version');
    const content = await this.content(source, plan);
    return this.db.transaction((tx) =>
      this.insertPlan(tx, {
        equipmentId: targetEquipmentId,
        content: copiedDraft(content),
        actor,
        copiedFrom: planId,
      }),
    );
  }

  private async versionRow(versionId: string): Promise<VersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(maintenancePlanVersions)
      .where(eq(maintenancePlanVersions.id, versionId));
    return row;
  }

  private async lockPlan(tx: Transaction, planId: string): Promise<PlanDb> {
    const [plan] = await tx
      .select()
      .from(maintenancePlans)
      .where(eq(maintenancePlans.id, planId))
      .for('update');
    if (!plan) throw new DomainError('PLAN_NOT_FOUND', 404, 'Plan not found');
    return plan;
  }

  private async draftOf(tx: Transaction, planId: string): Promise<VersionRow | null> {
    const [draft] = await tx
      .select()
      .from(maintenancePlanVersions)
      .where(
        and(
          eq(maintenancePlanVersions.planId, planId),
          isNull(maintenancePlanVersions.publishedAt),
        ),
      );
    return draft ?? null;
  }

  /** Saves the draft; editing an active plan opens the next version (FR-023). */
  async save(planId: string, content: PlanContent, actor: Actor) {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const plan = await this.lockPlan(tx, planId);
      const values = this.versionValues(content);
      const draft = await this.draftOf(tx, planId);
      const versionId = draft
        ? await this.updateDraft(tx, draft.id, values)
        : await this.insertDraft(tx, planId, values);
      await this.writeContent(tx, versionId, content);
      await tx
        .update(maintenancePlans)
        .set({
          title: content.title,
          firstDueOn: content.firstDueOn,
          version: plan.version + 1,
          updatedAt: now,
        })
        .where(eq(maintenancePlans.id, planId));
      await this.audit.record(tx, {
        actor,
        action: 'maintenance_plan.update',
        objectType: 'maintenance_plan',
        objectId: planId,
        after: { title: content.title },
      });
      return { id: planId };
    });
  }

  private async updateDraft(
    tx: Transaction,
    id: string,
    values: ReturnType<PlansService['versionValues']>,
  ) {
    await tx.update(maintenancePlanVersions).set(values).where(eq(maintenancePlanVersions.id, id));
    return id;
  }

  private async insertDraft(
    tx: Transaction,
    planId: string,
    values: ReturnType<PlansService['versionValues']>,
  ) {
    const [latest] = await tx
      .select({ revision: max(maintenancePlanVersions.revision) })
      .from(maintenancePlanVersions)
      .where(eq(maintenancePlanVersions.planId, planId));
    const [row] = await tx
      .insert(maintenancePlanVersions)
      .values({ planId, revision: (latest?.revision ?? 0) + 1, ...values })
      .returning({ id: maintenancePlanVersions.id });
    if (!row) throw new Error('maintenance_plan_versions: insert returned no row');
    return row.id;
  }

  /** What stops a draft from being published, field by field (FR-022). */
  async issues(tx: Transaction, plan: PlanDb, draft: VersionRow): Promise<PlanIssue[]> {
    const [operation] = await tx
      .select({ id: maintenancePlanOperations.id })
      .from(maintenancePlanOperations)
      .where(eq(maintenancePlanOperations.versionId, draft.id))
      .limit(1);
    const issues: PlanIssue[] = [];
    if (!plan.title.trim()) issues.push({ field: 'title', code: 'TITLE_REQUIRED' });
    if (!plan.activeVersionId && !plan.firstDueOn)
      issues.push({ field: 'firstDueOn', code: 'FIRST_DUE_REQUIRED' });
    if (!operation) issues.push({ field: 'operations', code: 'OPERATIONS_REQUIRED' });
    issues.push(...(await this.sourceIssues(tx, plan.equipmentId, draft)));
    issues.push(...(await this.assigneeIssues(tx, draft.assigneeEmployeeId)));
    return issues;
  }

  private async sourceIssues(
    tx: Transaction,
    equipmentId: string,
    draft: VersionRow,
  ): Promise<PlanIssue[]> {
    if (draft.sourceKind === PlanSourceKind.PLANT_DECISION)
      return draft.sourceNote?.trim()
        ? []
        : [{ field: 'sourceNote', code: 'SOURCE_NOTE_REQUIRED' }];
    if (!draft.sourceDocumentId)
      return [{ field: 'sourceDocumentId', code: 'SOURCE_DOCUMENT_REQUIRED' }];
    const [link] = await tx
      .select({ id: equipmentDocumentLinks.id })
      .from(equipmentDocumentLinks)
      .where(
        and(
          eq(equipmentDocumentLinks.equipmentId, equipmentId),
          eq(equipmentDocumentLinks.documentId, draft.sourceDocumentId),
          isNull(equipmentDocumentLinks.unlinkedAt),
        ),
      );
    return link ? [] : [{ field: 'sourceDocumentId', code: 'SOURCE_DOCUMENT_REQUIRED' }];
  }

  private async assigneeIssues(tx: Transaction, assigneeId: string | null): Promise<PlanIssue[]> {
    if (!assigneeId) return [{ field: 'assigneeEmployeeId', code: 'ASSIGNEE_REQUIRED' }];
    const staff = await maintenanceStaff(tx, [assigneeId]);
    return staff.length ? [] : [{ field: 'assigneeEmployeeId', code: 'ASSIGNEE_NOT_MECHANIC' }];
  }

  /**
   * Publishes the draft: it becomes the active version, and a first publication creates the work
   * for the first due date. Open work keeps its version (FR-023, FR-024).
   */
  async publish(planId: string, actor: Actor, now: Date = new Date()) {
    return this.db.transaction(async (tx) => {
      const plan = await this.lockPlan(tx, planId);
      const draft = await this.draftOf(tx, planId);
      if (!draft) throw new DomainError('PLAN_NOTHING_TO_PUBLISH', 409, 'Plan has no draft');
      const issues = await this.issues(tx, plan, draft);
      if (issues.length)
        throw new DomainError('PLAN_INVALID', 422, 'Plan cannot be published', { issues });
      await tx
        .update(maintenancePlanVersions)
        .set({ publishedAt: now, publishedBy: actor.id ?? 'system' })
        .where(eq(maintenancePlanVersions.id, draft.id));
      const first = !plan.activeVersionId;
      await tx
        .update(maintenancePlans)
        .set({
          state: PlanState.ACTIVE,
          activeVersionId: draft.id,
          stateReason: null,
          version: plan.version + 1,
          updatedAt: now,
        })
        .where(eq(maintenancePlans.id, planId));
      if (first && plan.firstDueOn && draft.assigneeEmployeeId)
        await this.scheduler.createCycleWithin(
          tx,
          {
            planId,
            versionId: draft.id,
            equipmentId: plan.equipmentId,
            title: plan.title,
            assigneeId: draft.assigneeEmployeeId,
            dueOn: plan.firstDueOn,
          },
          { actor, source: 'WEB', now },
        );
      await this.audit.record(tx, {
        actor,
        action: 'maintenance_plan.publish',
        objectType: 'maintenance_plan',
        objectId: planId,
        after: { revision: draft.revision },
      });
      return { id: planId };
    });
  }

  /** Pause, resume or archive; open work and overdue facts stay (AC-017). */
  async setState(
    planId: string,
    change: { state: PlanState; reason: string | null },
    actor: Actor,
  ) {
    return this.db.transaction(async (tx) => {
      const plan = await this.lockPlan(tx, planId);
      if (!plan.activeVersionId)
        throw new DomainError('PLAN_NOT_PUBLISHED', 409, 'Plan was never published');
      await tx
        .update(maintenancePlans)
        .set({
          state: change.state,
          stateReason: change.reason,
          version: plan.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(maintenancePlans.id, planId));
      await this.audit.record(tx, {
        actor,
        action: `maintenance_plan.${change.state.toLowerCase()}`,
        objectType: 'maintenance_plan',
        objectId: planId,
        reason: change.reason,
      });
      return { id: planId };
    });
  }

  /** Moves open planned work of a machine to its new responsible mechanic (AC-006). */
  async reassignOpenWorkWithin(tx: Transaction, input: ReassignInput): Promise<void> {
    const moved = await tx
      .update(workOrders)
      .set({
        assigneeEmployeeId: input.employeeId,
        version: sql`${workOrders.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(workOrders.equipmentId, input.equipmentId),
          eq(workOrders.type, WorkType.PLANNED_MAINTENANCE),
          notInArray(workOrders.status, FINAL),
        ),
      )
      .returning({ id: workOrders.id });
    await Promise.all(
      moved.map(async (row) => {
        await this.events.append(tx, {
          type: 'WORK_ORDER_REASSIGNED',
          source: 'WEB',
          actor: input.actor,
          occurredAt: input.now,
          payload: {
            workOrderId: row.id,
            equipmentId: input.equipmentId,
            employeeId: input.employeeId,
          },
        });
        await this.scheduler.notifyAssignedWithin(tx, row.id);
      }),
    );
  }
}
