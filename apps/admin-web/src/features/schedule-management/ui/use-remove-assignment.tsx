import type { AssignmentInput } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { useConfirm } from '@/components/app/confirm-dialog';
import type { Workspace } from '../model/use-workspace';
import { assignmentAbilities, removeAssignment } from '../model/assignment-actions';
import { employeeLabel } from './assignment-changes';

/**
 * Quick removal from a card or cell: one confirmation, then the same local edit every view makes.
 * The details panel and the editor keep their deliberate, unconfirmed Remove button.
 */
export function useRemoveAssignment(w: Workspace) {
  const t = messages(currentLocale()).scheduleWorkspace;
  const { confirm, dialog } = useConfirm();
  async function remove(item: AssignmentInput, onRemoved?: () => void) {
    if (!assignmentAbilities(w, item).removable) return;
    const accepted = await confirm({
      title: t.removeAssignment,
      description: format(t.removeAssignmentConfirm, {
        name: employeeLabel(w, item.employeeId),
        date: item.businessDate,
      }),
      confirmLabel: t.removeAssignment,
      destructive: true,
    });
    if (accepted === false) return;
    w.edit(removeAssignment(w.grid, item));
    onRemoved?.();
  }
  return { remove, dialog };
}
