import { useState, type ReactNode } from 'react';
import {
  ArchiveIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SaveIcon,
  SendIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDetail, PlanDetail } from '@vakhta/contracts';
import { PlanState, type PlanState as State } from '@vakhta/domain';
import { format } from '@vakhta/i18n';
import {
  maintenanceApi,
  maintenanceKeys,
  maintenanceMessages,
  maintenanceQueries,
} from '@/entities/maintenance';
import { useConfirm } from '@/components/app/confirm-dialog';
import { DetailSheet } from '@/components/app/detail-sheet';
import { Feedback } from '@/components/app/feedback';
import { StatusPill } from '@/components/app/page';
import { QueryFeedback } from '@/components/app/query-feedback';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';
import {
  draftFromContent,
  emptyPlan,
  publishIssues,
  sameDraft,
  toContent,
  type PlanDraft,
  type PublishIssue,
} from '../model/plan-draft';
import {
  AssigneeBlock,
  IntervalBlock,
  MaterialsBlock,
  OperationsBlock,
  SchedulePreviewAlert,
  SourceBlock,
} from './plan-blocks';
import { IconButton } from '@/shared/ui/icon-button';
import { RichText } from '@/shared/ui/rich-text';

interface EditorProps {
  readonly equipmentId: string;
  readonly planId: string | null;
  readonly canManage: boolean;
  readonly onClose: () => void;
}

/** What the form works with once loaded; the machine and the plan arrive from their queries. */
interface FormProps extends EditorProps {
  readonly machine: EquipmentDetail | null;
  readonly detail: PlanDetail | null;
  readonly loading?: ReactNode;
}

function initialDraft(machine: EquipmentDetail | null, detail: PlanDetail | null): PlanDraft {
  const content = detail?.draft ?? detail?.active;
  return content ? draftFromContent(content) : emptyPlan(machine);
}

/** Which state change the footer offers for a published plan (FR-025). */
const STATE_ACTIONS: Readonly<Record<State, readonly State[]>> = {
  DRAFT: [],
  ACTIVE: [PlanState.PAUSED, PlanState.ARCHIVED],
  PAUSED: [PlanState.ACTIVE, PlanState.ARCHIVED],
  ARCHIVED: [],
};

const STATE_ICONS: Readonly<Record<State, LucideIcon>> = {
  DRAFT: PencilIcon,
  ACTIVE: PlayIcon,
  PAUSED: PauseIcon,
  ARCHIVED: ArchiveIcon,
};

function stateLabel(state: State): string {
  const t = maintenanceMessages().planForm;
  const labels: Readonly<Record<State, string>> = {
    DRAFT: t.saveDraft,
    ACTIVE: t.resume,
    PAUSED: t.pause,
    ARCHIVED: t.archive,
  };
  return labels[state];
}

function stateNotice(state: State): string {
  const t = maintenanceMessages().planForm;
  const notices: Readonly<Record<State, string>> = {
    DRAFT: t.saved,
    ACTIVE: t.resumed,
    PAUSED: t.paused,
    ARCHIVED: t.archived,
  };
  return notices[state];
}

function IssueList({ issues }: { readonly issues: readonly PublishIssue[] }) {
  const t = maintenanceMessages();
  if (!issues.length) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{t.errors.PLAN_INVALID}</AlertTitle>
      <ul className="col-start-2 list-disc pl-4 text-sm">
        {issues.map((issue) => (
          <li key={issue}>{t.planForm.issues[issue]}</li>
        ))}
      </ul>
    </Alert>
  );
}

function usePlanMutations(input: {
  readonly equipmentId: string;
  readonly planId: string | null;
  readonly onSaved: (planId: string, draft: PlanDraft) => void;
}) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: maintenanceKeys.all });
  const persist = async (draft: PlanDraft): Promise<string> => {
    const checked = toContent(draft);
    if (!checked.ok) throw new InvalidDraft(checked.fields);
    const saved = input.planId
      ? await maintenanceApi.savePlan(input.planId, checked.content)
      : await maintenanceApi.createPlan(input.equipmentId, checked.content);
    input.onSaved(saved.id, draft);
    return saved.id;
  };
  const save = useMutation({ mutationFn: persist, onSuccess: refresh });
  const publish = useMutation({
    mutationFn: async (draft: PlanDraft) => maintenanceApi.publishPlan(await persist(draft)),
    onSuccess: refresh,
  });
  const changeState = useMutation({
    mutationFn: (command: { planId: string; state: State; reason?: string }) =>
      maintenanceApi.setPlanState(command.planId, {
        state: command.state === PlanState.DRAFT ? PlanState.ACTIVE : command.state,
        ...(command.reason ? { reason: command.reason } : {}),
      }),
    onSuccess: refresh,
  });
  return { save, publish, changeState };
}

/** A draft the contract refuses; carries the fields to mark instead of a server error. */
class InvalidDraft extends Error {
  constructor(readonly fields: ReadonlySet<string>) {
    super('Invalid plan draft');
  }
}

function failureOf(mutations: readonly { readonly error: Error | null }[]): Error | null {
  return mutations.find((mutation) => mutation.error !== null)?.error ?? null;
}

function invalidFields(failure: Error | null): ReadonlySet<string> {
  return failure instanceof InvalidDraft ? failure.fields : new Set<string>();
}

function serverError(failure: Error | null): string | null {
  if (!failure || failure instanceof InvalidDraft) return null;
  return describeError(failure);
}

function PlanTitle({
  machine,
  detail,
}: {
  readonly machine: EquipmentDetail | null;
  readonly detail: PlanDetail | null;
}) {
  const t = maintenanceMessages();
  if (!machine) return t.plans.title;
  return (
    <>
      {format(t.planForm.createTitle, {
        machine: `${machine.code} ${machine.model ?? machine.name}`,
      })}
      {detail && detail.state !== PlanState.ACTIVE ? (
        <StatusPill>{t.planState[detail.state]}</StatusPill>
      ) : null}
      {detail?.activeRevision ? (
        <StatusPill>
          {format(t.planForm.activeRevision, { revision: detail.activeRevision })}
        </StatusPill>
      ) : null}
    </>
  );
}

/** The form's state and its named actions; the components below only render them. */
function usePlanForm({ machine, equipmentId, detail, onClose }: FormProps) {
  const t = maintenanceMessages();
  // Until the first edit the draft mirrors the loaded plan, so the sheet can mount before it arrives.
  const loaded = initialDraft(machine, detail);
  const [edited, setEdited] = useState<PlanDraft | null>(null);
  const [saved, setSaved] = useState<PlanDraft | null>(null);
  const draft = edited ?? loaded;
  const baseline = saved ?? loaded;
  const setDraft = (change: (current: PlanDraft) => PlanDraft) =>
    setEdited((current) => change(current ?? loaded));
  const [planId, setPlanId] = useState(detail?.id ?? null);
  const [issues, setIssues] = useState<readonly PublishIssue[]>([]);
  const { confirm, dialog } = useConfirm();
  const { save, publish, changeState } = usePlanMutations({
    equipmentId,
    planId,
    onSaved: (id, draftSaved) => {
      setPlanId(id);
      setSaved(draftSaved);
    },
  });
  const failure = failureOf([save, publish, changeState]);
  const onPublish = () => {
    const found = publishIssues(draft, detail?.activeRevision != null);
    setIssues(found);
    if (found.length) return;
    publish.mutate(draft, {
      onSuccess: () => {
        notifySuccess(t.planForm.published);
        onClose();
      },
    });
  };
  const onState = async (target: State) => {
    if (!planId) return;
    const reason =
      target === PlanState.ACTIVE
        ? ''
        : await confirm({
            title: stateLabel(target),
            commentLabel: t.planForm.reasonTitle,
            commentRequired: true,
          });
    if (reason === false) return;
    changeState.mutate(
      { planId, state: target, reason },
      { onSuccess: () => notifySuccess(stateNotice(target)) },
    );
  };
  return {
    draft,
    patch: (change: Partial<PlanDraft>) => setDraft((current) => ({ ...current, ...change })),
    dirty: !sameDraft(draft, baseline),
    canPublish: !sameDraft(draft, baseline) || Boolean(detail?.draft) || planId === null,
    issues,
    invalid: invalidFields(failure),
    error: serverError(failure),
    dialog,
    save: () => save.mutate(draft, { onSuccess: () => notifySuccess(t.planForm.saved) }),
    saving: save.isPending,
    publish: onPublish,
    publishing: publish.isPending,
    changeState: (target: State) => void onState(target),
    changingTo: changeState.isPending ? changeState.variables.state : null,
  };
}

type PlanFormModel = ReturnType<typeof usePlanForm>;

function PlanFooter({ model, state }: { readonly model: PlanFormModel; readonly state: State }) {
  const t = maintenanceMessages();
  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      {STATE_ACTIONS[state].map((target) => (
        <IconButton
          key={target}
          icon={STATE_ICONS[target]}
          label={stateLabel(target)}
          tooltip={t.planForm.stateHints[target]}
          variant="ghost"
          pending={model.changingTo === target}
          onClick={() => model.changeState(target)}
        />
      ))}
      <IconButton
        icon={SaveIcon}
        label={t.planForm.saveDraft}
        tooltip={t.planForm.saveDraftHint}
        variant="outline"
        disabled={!model.dirty}
        pending={model.saving}
        onClick={model.save}
      />
      <IconButton
        icon={SendIcon}
        label={t.planForm.publish}
        tooltip={t.planForm.publishHint}
        disabled={!model.canPublish}
        pending={model.publishing}
        onClick={model.publish}
      />
    </div>
  );
}

function PlanBlocks({
  machine,
  model,
  readOnly,
}: {
  readonly machine: EquipmentDetail;
  readonly model: PlanFormModel;
  readonly readOnly: boolean;
}) {
  const mechanics = useQuery(maintenanceQueries.mechanics());
  const policy = useQuery(maintenanceQueries.policy());
  const blockProps = { draft: model.draft, patch: model.patch, invalid: model.invalid, readOnly };
  return (
    <>
      <SourceBlock {...blockProps} machine={machine} />
      <IntervalBlock {...blockProps} />
      <OperationsBlock {...blockProps} />
      <MaterialsBlock {...blockProps} />
      <AssigneeBlock {...blockProps} mechanics={mechanics.data ?? []} policy={policy.data} />
      <SchedulePreviewAlert
        draft={model.draft}
        mechanics={mechanics.data ?? []}
        policy={policy.data}
      />
    </>
  );
}

function PlanForm(props: FormProps) {
  const t = maintenanceMessages();
  const { machine, detail, canManage, onClose, loading } = props;
  const model = usePlanForm(props);
  const state = detail?.state ?? PlanState.DRAFT;
  const readOnly = !canManage || state === PlanState.ARCHIVED;
  return (
    <DetailSheet
      open
      size="wide"
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={<PlanTitle machine={machine} detail={detail} />}
      description={t.planForm.hint}
      footer={readOnly || loading ? undefined : <PlanFooter model={model} state={state} />}
    >
      {loading}
      <IssueList issues={model.issues} />
      <Feedback error={model.error} />
      {detail?.stateReason ? (
        <RichText text={detail.stateReason} className="text-sm text-muted-foreground" />
      ) : null}
      {machine && !loading ? (
        <PlanBlocks machine={machine} model={model} readOnly={readOnly} />
      ) : null}
      {model.dialog}
    </DetailSheet>
  );
}

/**
 * The maintenance plan editor (spec 014, US3): draft, publication and pause/archive. One sheet
 * opens once and keeps its place while the plan loads, so the panel never slides in twice.
 */
export function PlanEditor(props: EditorProps) {
  const machineQuery = useQuery(maintenanceQueries.equipmentDetail(props.equipmentId));
  const planQuery = useQuery({
    ...maintenanceQueries.plan(props.planId ?? ''),
    enabled: props.planId !== null,
  });
  const machine = machineQuery.data ?? null;
  const detail = planQuery.data ?? null;
  const pending = machine === null || (props.planId !== null && detail === null);
  // One loader for the whole first read: the machine first, then the plan.
  const loading = pending ? (
    <QueryFeedback query={machine ? planQuery : machineQuery} />
  ) : undefined;
  return <PlanForm {...props} machine={machine} detail={detail} loading={loading} />;
}
