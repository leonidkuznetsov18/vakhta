import { createStore } from 'zustand/vanilla';
import {
  CreateCommunication,
  type CommunicationAttachment,
  type CommunicationRecipient,
  type QuestionnaireDefinition,
  type QuestionnaireQuestion,
} from '@vakhta/contracts';
export type ContextRecipient = Pick<CommunicationRecipient, 'id' | 'fullName' | 'personnelNumber'>;
export type DraftFile = {
  id: string;
  file: File;
  preview: string | null;
  controller: AbortController;
} & (
  | { status: 'UPLOADING' }
  | { status: 'FAILED'; error: unknown }
  | { status: 'READY'; attachment: CommunicationAttachment }
);
export interface CommunicationDraft {
  open: boolean;
  expanded: boolean;
  view: 'compose' | 'history';
  phase: 'EDITING' | 'REVIEW' | 'SUBMITTING' | 'UNCERTAIN';
  requestId: string;
  text: string;
  recipients: ContextRecipient[];
  files: DraftFile[];
  questionnaire: QuestionnaireDefinition | null;
  pendingContext: { recipient: ContextRecipient; text: string } | null;
  error: unknown;
  detailId: string | null;
}
const empty = (): CommunicationDraft => ({
  open: false,
  expanded: false,
  view: 'compose',
  phase: 'EDITING',
  requestId: crypto.randomUUID(),
  text: '',
  recipients: [],
  files: [],
  questionnaire: null,
  pendingContext: null,
  error: null,
  detailId: null,
});
export function draftCommand(draft: CommunicationDraft) {
  if (draft.files.some((file) => file.status !== 'READY')) return null;
  const result = CreateCommunication.safeParse({
    requestId: draft.requestId,
    recipientIds: draft.recipients.map((person) => person.id),
    text: draft.text,
    attachmentIds: draft.files.flatMap((file) =>
      file.status === 'READY' ? [file.attachment.id] : [],
    ),
    questionnaire: draft.questionnaire,
  });
  return result.success ? result.data : null;
}
export const hasDraft = (draft: CommunicationDraft) =>
  !!(draft.text || draft.recipients.length || draft.files.length || draft.questionnaire);
export const newQuestion = (): QuestionnaireQuestion => ({
  id: crypto.randomUUID(),
  kind: 'TEXT',
  prompt: '',
  required: true,
});
export function createCommunicationDraft() {
  let opener: HTMLElement | null = null;
  let active = true;
  const store = createStore<CommunicationDraft>()(empty);
  const update = (patch: Partial<CommunicationDraft>) => {
    if (active) store.setState(patch);
  };
  const release = (file: DraftFile) => {
    file.controller.abort();
    if (file.preview) URL.revokeObjectURL(file.preview);
  };
  const editable = () => ['EDITING', 'REVIEW'].includes(store.getState().phase);
  return {
    store,
    update,
    open(recipient?: ContextRecipient, text = '') {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const state = store.getState();
      if (!state.open && window.matchMedia('(max-width: 767px)').matches)
        window.history.pushState(
          { ...window.history.state, communicationDock: true },
          '',
          window.location.href,
        );
      if (!editable()) {
        update({ open: true, view: 'compose' });
        return;
      }
      if (
        recipient &&
        hasDraft(state) &&
        (state.recipients.length !== 1 ||
          state.recipients[0]?.id !== recipient.id ||
          (!!text && state.text !== text))
      )
        update({ open: true, pendingContext: { recipient, text } });
      else
        update({
          open: true,
          view: 'compose',
          ...(recipient ? { recipients: [recipient], ...(text ? { text } : {}) } : {}),
        });
    },
    minimize() {
      update({ open: false });
      if (window.history.state?.communicationDock) window.history.back();
      const background = document.querySelector<HTMLElement>('[data-communications-background]');
      if (background) background.inert = false;
      if (opener?.isConnected) opener.focus();
      else document.querySelector<HTMLElement>('[data-communications-trigger]')?.focus();
    },
    reset() {
      store.getState().files.forEach(release);
      update({ ...empty(), open: true });
    },
    replaceContext() {
      const context = store.getState().pendingContext;
      if (!context || !editable()) return;
      store.getState().files.forEach(release);
      update({ ...empty(), open: true, recipients: [context.recipient], text: context.text });
    },
    change(patch: Pick<Partial<CommunicationDraft>, 'text' | 'recipients' | 'questionnaire'>) {
      if (editable()) update({ ...patch, phase: 'EDITING', error: null });
    },
    toggle(person: ContextRecipient) {
      if (!editable()) return;
      const recipients = store.getState().recipients;
      update({
        recipients: recipients.some((row) => row.id === person.id)
          ? recipients.filter((row) => row.id !== person.id)
          : recipients.length < 500
            ? [...recipients, person]
            : recipients,
        phase: 'EDITING',
      });
    },
    addFile(file: File) {
      if (!editable() || store.getState().files.length >= 5) return null;
      const row: DraftFile = {
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        controller: new AbortController(),
        status: 'UPLOADING',
      };
      update({ files: [...store.getState().files, row], phase: 'EDITING' });
      return row;
    },
    removeFile(id: string) {
      if (!editable()) return;
      const file = store.getState().files.find((row) => row.id === id);
      if (file) release(file);
      update({ files: store.getState().files.filter((row) => row.id !== id), phase: 'EDITING' });
    },
    finishFile(id: string, outcome: { attachment: CommunicationAttachment } | { error: unknown }) {
      update({
        files: store
          .getState()
          .files.map((row) =>
            row.id === id
              ? 'attachment' in outcome
                ? { ...row, status: 'READY', attachment: outcome.attachment }
                : { ...row, status: 'FAILED', error: outcome.error }
              : row,
          ),
      });
    },
    dispose() {
      active = false;
      store.getState().files.forEach(release);
      store.setState(empty());
    },
    activate() {
      active = true;
    },
  };
}
export type DraftController = ReturnType<typeof createCommunicationDraft>;
