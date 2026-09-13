import { z } from 'zod';
import { BusinessDate, IsoDateTime, Uuid } from './common.js';
import { Month } from './scheduling.js';

/** Notes with an explicit audience (SC-39): planners only, or the employees concerned. */
export const NoteAudience = z.enum(['PLANNERS', 'EMPLOYEES']);
export type NoteAudience = z.infer<typeof NoteAudience>;

export const ScheduleNoteView = z.object({
  id: Uuid,
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  businessDate: BusinessDate.nullable(),
  zoneId: Uuid.nullable(),
  employeeId: Uuid.nullable(),
  audience: NoteAudience,
  text: z.string(),
  createdBy: Uuid.nullable(),
  createdAt: IsoDateTime,
});
export type ScheduleNoteView = z.infer<typeof ScheduleNoteView>;

export const ScheduleNotesQuery = z.object({ siteId: Uuid, orgUnitId: Uuid, periodMonth: Month });
export type ScheduleNotesQuery = z.infer<typeof ScheduleNotesQuery>;

export const CreateScheduleNoteCommand = z.object({
  siteId: Uuid,
  orgUnitId: Uuid,
  periodMonth: Month,
  businessDate: BusinessDate.nullable().default(null),
  zoneId: Uuid.nullable().default(null),
  employeeId: Uuid.nullable().default(null),
  audience: NoteAudience.default('PLANNERS'),
  text: z.string().trim().min(1).max(2000),
});
export type CreateScheduleNoteCommand = z.infer<typeof CreateScheduleNoteCommand>;

/** A note as the employee sees it in the bot plan: date or month-wide, text only. */
export const EmployeeNoteView = z.object({ date: BusinessDate.nullable(), text: z.string() });
export type EmployeeNoteView = z.infer<typeof EmployeeNoteView>;
