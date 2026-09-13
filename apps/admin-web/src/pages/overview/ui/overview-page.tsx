import type { MeView } from '@vakhta/contracts';
import { OverviewPage as Overview, type OverviewPlanningTarget } from '@/features/overview';
import { writeSchedulePreset } from '@/features/schedule-management';
import { useNavigation } from '@/navigation';

/** Compose the Overview intent with Schedule's existing state and navigation boundary. */
export function OverviewPage({ me }: { readonly me: MeView }) {
  const { go } = useNavigation();
  function planFor({ orgUnitId, people }: OverviewPlanningTarget): void {
    const first = people[0];
    if (first) {
      writeSchedulePreset({
        actorId: me.id,
        orgUnitId,
        month: first.businessDate.slice(0, 7),
        people: people.map((p) => ({ id: p.employeeId, name: p.fullName })),
      });
    }
    go('schedule');
  }
  return <Overview me={me} onPlanPeople={planFor} />;
}
