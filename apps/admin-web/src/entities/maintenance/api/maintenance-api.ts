import { z } from 'zod';
import {
  DocumentLinkView,
  EmergencyCreateCommand,
  EquipmentDetail,
  EquipmentInput,
  EquipmentRow,
  EquipmentUpdate,
  LibraryDocumentView,
  MaintenanceCalendarView,
  MaintenanceSummary,
  MechanicOption,
  MediaLinkView,
  PlanContent,
  PlanDetail,
  PlanStateCommand,
  ReassignCommand,
  ReleaseCommand,
  ReplanCommand,
  ReviewCommand,
  WorkDetail,
  WorkRow,
  type CalendarQuery,
  type DocumentUploadQuery,
  type EquipmentQuery,
  type WorkQuery,
} from '@vakhta/contracts';
import { apiRequest } from '@/shared/api';

/** HTTP boundary of equipment maintenance (spec 014): every response is parsed by its contract. */

const root = '/admin/maintenance';
const Created = z.object({ id: z.string().uuid() });

type Signal = AbortSignal | undefined;

async function read<T>(
  schema: z.ZodType<T>,
  url: string,
  input: { params?: object; signal: Signal },
) {
  const data = await apiRequest<unknown>(
    { method: 'GET', url, ...(input.params ? { params: input.params } : {}) },
    input.signal ? { signal: input.signal } : undefined,
  );
  return schema.parse(data);
}

async function send<T>(
  schema: z.ZodType<T>,
  url: string,
  input: { method?: 'POST' | 'PUT' | 'DELETE'; data?: unknown },
) {
  const data = await apiRequest<unknown>({ method: input.method ?? 'POST', url, data: input.data });
  return schema.parse(data);
}

export const maintenanceApi = {
  summary: (signal: Signal) => read(MaintenanceSummary, `${root}/summary`, { signal }),
  mechanics: (signal: Signal) => read(z.array(MechanicOption), `${root}/mechanics`, { signal }),
  equipment: (query: EquipmentQuery, signal: Signal) =>
    read(z.array(EquipmentRow), `${root}/equipment`, { params: query, signal }),
  equipmentDetail: (id: string, signal: Signal) =>
    read(EquipmentDetail, `${root}/equipment/${id}`, { signal }),
  library: (signal: Signal) => read(z.array(LibraryDocumentView), `${root}/documents`, { signal }),
  documentLink: (documentId: string, signal: Signal) =>
    read(DocumentLinkView, `${root}/documents/${documentId}/link`, { signal }),
  plan: (planId: string, signal: Signal) => read(PlanDetail, `${root}/plans/${planId}`, { signal }),
  work: (query: WorkQuery, signal: Signal) =>
    read(z.array(WorkRow), `${root}/work`, { params: query, signal }),
  workDetail: (id: string, signal: Signal) => read(WorkDetail, `${root}/work/${id}`, { signal }),
  photoLink: (workId: string, mediaId: string, signal: Signal) =>
    read(MediaLinkView, `${root}/work/${workId}/media/${mediaId}/link`, { signal }),
  calendar: (query: CalendarQuery, signal: Signal) =>
    read(MaintenanceCalendarView, `${root}/calendar`, { params: query, signal }),

  createEquipment: (input: EquipmentInput) =>
    send(Created, `${root}/equipment`, { data: EquipmentInput.parse(input) }),
  updateEquipment: (id: string, input: EquipmentUpdate) =>
    send(Created, `${root}/equipment/${id}`, { method: 'PUT', data: EquipmentUpdate.parse(input) }),
  archiveEquipment: (id: string, reason: string) =>
    send(Created, `${root}/equipment/${id}/archive`, { data: { reason } }),
  uploadDocument: async (equipmentId: string, input: { meta: DocumentUploadQuery; file: File }) => {
    const form = new FormData();
    form.append('file', input.file);
    const data = await apiRequest<unknown>({
      method: 'POST',
      url: `${root}/equipment/${equipmentId}/documents`,
      params: input.meta,
      data: form,
    });
    return Created.parse(data);
  },
  attachDocument: (equipmentId: string, documentId: string) =>
    send(Created, `${root}/equipment/${equipmentId}/documents/${documentId}`, {}),
  unlinkDocument: (equipmentId: string, documentId: string) =>
    send(z.unknown(), `${root}/equipment/${equipmentId}/documents/${documentId}`, {
      method: 'DELETE',
    }),
  createPlan: (equipmentId: string, content: PlanContent) =>
    send(Created, `${root}/equipment/${equipmentId}/plans`, { data: PlanContent.parse(content) }),
  savePlan: (planId: string, content: PlanContent) =>
    send(Created, `${root}/plans/${planId}`, { method: 'PUT', data: PlanContent.parse(content) }),
  publishPlan: (planId: string) => send(z.unknown(), `${root}/plans/${planId}/publish`, {}),
  setPlanState: (planId: string, command: PlanStateCommand) =>
    send(Created, `${root}/plans/${planId}/state`, { data: PlanStateCommand.parse(command) }),
  review: (id: string, command: ReviewCommand) =>
    send(z.unknown(), `${root}/work/${id}/review`, { data: ReviewCommand.parse(command) }),
  replan: (id: string, command: ReplanCommand) =>
    send(z.unknown(), `${root}/work/${id}/replan`, { data: ReplanCommand.parse(command) }),
  cancel: (id: string, reason: string) =>
    send(z.unknown(), `${root}/work/${id}/cancel`, { data: { reason } }),
  reassign: (id: string, command: ReassignCommand) =>
    send(z.unknown(), `${root}/work/${id}/reassign`, { data: ReassignCommand.parse(command) }),
  createEmergency: (equipmentId: string, command: EmergencyCreateCommand) =>
    send(z.unknown(), `${root}/equipment/${equipmentId}/emergency`, {
      data: EmergencyCreateCommand.parse(command),
    }),
  release: (equipmentId: string, command: ReleaseCommand) =>
    send(z.unknown(), `${root}/equipment/${equipmentId}/release`, {
      data: ReleaseCommand.parse(command),
    }),
};
