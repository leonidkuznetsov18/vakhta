import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A named task zone. Surface emphasis indicates an action area, never a record status. */
export function WorkflowSection({
  title,
  children,
  hint,
  emphasis = 'neutral',
  className,
}: {
  title: string;
  children: ReactNode;
  hint?: ReactNode;
  emphasis?: 'neutral' | 'action';
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'min-w-0 rounded-lg border bg-background',
        emphasis === 'action' && 'border-primary/30',
        className,
      )}
    >
      <h3
        className={cn(
          'flex items-center gap-2 rounded-t-lg border-b bg-muted/50 px-3 py-2 text-sm font-semibold',
          emphasis === 'action' && 'border-primary/20 bg-primary/5',
        )}
      >
        {title}
        {hint}
      </h3>
      <div className="flex min-w-0 flex-col gap-4 p-3">{children}</div>
    </section>
  );
}
