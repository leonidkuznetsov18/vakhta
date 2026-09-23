import { endsNextDay, type TemplateHours } from '@vakhta/domain';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

/** The hours are a shift's main identity; "+1" marks an end on the next day. */
export function ShiftHours({
  hours,
  className,
}: {
  readonly hours: TemplateHours;
  readonly className?: string;
}) {
  return (
    <span className={cn('tabular-nums', className)}>
      {hours.localStart}–{hours.localEnd}
      {endsNextDay(hours) && (
        <>
          <sup aria-hidden="true" className="ml-0.5 text-[10px] font-medium text-muted-foreground">
            +1
          </sup>
          <span className="sr-only">{messages(currentLocale()).unitShifts.untilNextDay}</span>
        </>
      )}
    </span>
  );
}
