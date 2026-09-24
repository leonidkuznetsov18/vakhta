import type { MaterialMode, WorkPriority, WorkType } from './codes.js';

/** What a maintenance or repair notification shows; loaded by `@vakhta/db`, rendered by `@vakhta/i18n` (spec 014). */
export interface MaintenanceNoticeData {
  readonly workOrderId: string;
  readonly number: number;
  readonly type: WorkType;
  readonly priority: WorkPriority;
  readonly title: string;
  readonly equipmentCode: string;
  readonly equipmentName: string;
  /** The model the shop floor names the machine by; null when unknown. */
  readonly equipmentModel: string | null;
  readonly location: string;
  /** Local 'DD.MM.YYYY' of the planned date; null for a repair. */
  readonly plannedOn: string | null;
  readonly estimatedMinutes: number | null;
  readonly requiresStop: boolean | null;
  readonly operations: readonly { readonly text: string; readonly photoRequired: boolean }[];
  readonly materials: readonly {
    readonly name: string;
    readonly quantity: string;
    readonly unit: string;
    readonly mode: MaterialMode;
  }[];
  readonly source: string | null;
  readonly hasDocument: boolean;
  readonly description: string | null;
  readonly reporterName: string | null;
  /** Local 'HH:mm' of the report and of the acknowledgement deadline. */
  readonly reportedAtLocal: string | null;
  readonly ackDueLocal: string | null;
}
