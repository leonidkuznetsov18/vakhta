import { CommandRecovery } from './command-recovery';
import { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Feedback } from '@/components/app/feedback';
import { QueryFeedback } from '@/components/app/query-feedback';
import { readError } from '@/errors';
import type { Workspace } from '../model/use-workspace';
import { assignmentChanges, countChanges, type GridState } from '../model/grid';
import { AssignmentChanges } from './assignment-changes';
const t = messages(currentLocale()).scheduleWorkspace;
export function PublicationReview({
  workspace: w,
  snapshot,
  versionId,
  onClose,
}: {
  workspace: Workspace;
  snapshot: GridState;
  versionId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const changed = w.version?.id !== versionId || countChanges(snapshot, w.grid) > 0;
  const completed =
    sent &&
    !w.pendingCommand &&
    !w.busy &&
    !w.error &&
    w.version?.status === 'PUBLISHED' &&
    !w.changes;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !w.busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t.reviewPublish}</DialogTitle>
          <DialogDescription>{completed ? t.success : t.publishHint}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto space-y-4 pr-1">
          <QueryFeedback query={w.publishedQuery} />
          {w.publicationReady && !completed && (
            <AssignmentChanges
              changes={assignmentChanges(w.publicationBaseline, snapshot)}
              labels={w}
            />
          )}
          <p className="text-sm text-muted-foreground">{t.noChecks}</p>
          {!completed && (
            <div className="space-y-2">
              <Label htmlFor="schedule-publish-reason">{t.reason}</Label>
              <Textarea
                id="schedule-publish-reason"
                value={reason}
                maxLength={1000}
                disabled={w.busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          <Feedback error={readError(w.error)} />
          <CommandRecovery workspace={w} />
          {changed && !completed && <Feedback error={t.stale} />}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={w.busy} onClick={onClose}>
            {completed ? messages(currentLocale()).ui.common.close : t.cancel}
          </Button>
          {!completed && (
            <Button
              disabled={
                !w.commandReady ||
                changed ||
                w.stale ||
                !w.publicationReady ||
                (w.version?.status === 'IN_REVIEW' && w.changes > 0)
              }
              onClick={() => {
                if (!changed && w.publicationReady) {
                  setSent(true);
                  w.commit(
                    w.version?.status === 'PUBLISHED' ? 'revise' : 'publish',
                    reason,
                    w.grid,
                  );
                }
              }}
            >
              {messages(currentLocale()).admin.schedule.publish}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
