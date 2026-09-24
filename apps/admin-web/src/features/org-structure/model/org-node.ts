import type { OrgUnitView } from '@vakhta/contracts';

/**
 * Prototype extension of the org contract for spec 014: typed nodes and dated responsible
 * slots. The production change adds these to `@vakhta/contracts` (`OrgUnitKind`,
 * `ResponsibleSlot`, `org_unit_responsibles`); until then the workspace model reads them from here.
 */
export const OrgUnitKind = {
  DIVISION: 'DIVISION',
  SHOP: 'SHOP',
  SECTION: 'SECTION',
} as const;
export type OrgUnitKind = (typeof OrgUnitKind)[keyof typeof OrgUnitKind];

/** The kind a parent must have; a division has no parent. */
export const PARENT_KIND: Record<OrgUnitKind, OrgUnitKind | null> = {
  DIVISION: null,
  SHOP: OrgUnitKind.DIVISION,
  SECTION: OrgUnitKind.SHOP,
};

export const ResponsibleSlot = {
  HEAD: 'HEAD',
  SHIFT_MASTER_DAY: 'SHIFT_MASTER_DAY',
  SHIFT_MASTER_NIGHT: 'SHIFT_MASTER_NIGHT',
} as const;
export type ResponsibleSlot = (typeof ResponsibleSlot)[keyof typeof ResponsibleSlot];
export const RESPONSIBLE_SLOTS: readonly ResponsibleSlot[] = [
  ResponsibleSlot.HEAD,
  ResponsibleSlot.SHIFT_MASTER_DAY,
  ResponsibleSlot.SHIFT_MASTER_NIGHT,
];

export interface OrgNodeView extends OrgUnitView {
  readonly kind: OrgUnitKind;
  readonly archivedAt: string | null;
  /** Business date the current version took effect. */
  readonly validFrom: string;
}

export interface ResponsibleAssignment {
  readonly unitId: string;
  readonly slot: ResponsibleSlot;
  readonly employeeId: string;
  readonly validFrom: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly unitId: string;
  readonly at: string;
  readonly author: string;
  readonly text: string;
}
