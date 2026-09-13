import type { MeView } from '@vakhta/contracts';
import { EmptyState, Muted, Section } from '@/components/app/page';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { writeRoute } from '@/lib/route';
import { setUiState } from '@/lib/ui-store';
import { useNavigation } from '@/navigation';
import { LoadingState } from '@/shared/ui/loading-state';
import type { OverviewSelection } from '../model/destination';
import { useOverviewEvents } from '../model/snapshot';
import { overviewText } from '../model/time';

/** "Recent events" (spec 004 US8): curated, scoped operational events; each row opens its record. */
export function EventFeed({
  me,
  selection,
}: {
  readonly me: MeView;
  readonly selection: OverviewSelection;
  readonly now: Date;
}) {
  const c = overviewText();
  const { go } = useNavigation();
  const events = useOverviewEvents(me, selection, true);
  return (
    <Section title={c.feedTitle} hint={c.feedHint}>
      {events.isPending ? (
        <LoadingState className="py-4" />
      ) : events.isError && !events.data ? (
        <div role="alert" className="flex items-center gap-2 text-sm">
          <span>{c.unknown.replace('{list}', c.feedTitle)}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void events.refetch()}>
            {c.retry}
          </Button>
        </div>
      ) : events.data.length === 0 ? (
        <EmptyState text={c.feedEmpty} />
      ) : (
        <ol className="flex max-h-96 flex-col divide-y overflow-y-auto rounded-lg border">
          {events.data.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="flex w-full min-w-0 items-start gap-3 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                onClick={() => {
                  if (e.target.section === 'operations')
                    setUiState({
                      'operations.scope': 'ALL',
                      'operations.day': e.target.businessDate ?? '',
                      'operations.openId': e.target.id,
                    });
                  if (e.target.section === 'incidents')
                    setUiState({
                      'incidents.scope': 'all',
                      'incidents.period': 'all',
                      'incidents.openId': e.target.id,
                    });
                  if (e.target.section === 'handover')
                    setUiState({
                      'handover.scope': 'all',
                      'handover.date': '',
                      'handover.openId': e.target.id,
                    });
                  go(e.target.section);
                  writeRoute(e.target.section, e.target.id ?? undefined);
                }}
              >
                <time dateTime={e.at} className="w-12 shrink-0 text-muted-foreground tabular-nums">
                  {formatTime(e.at)}
                </time>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium break-words">{c.eventKinds[e.kind]}</span>
                  <Muted className="break-words">
                    {[e.zoneName, e.reasonLabel, e.employeeName].filter(Boolean).join(' · ')}
                  </Muted>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
