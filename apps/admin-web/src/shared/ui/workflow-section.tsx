import { useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/app/info-tip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

type SectionProps = {
  title: string;
  children: ReactNode;
  hint?: ReactNode;
  emphasis?: 'neutral' | 'action';
  className?: string;
  /** The whole header bar folds and unfolds the body; the section starts open. */
  collapsible?: boolean;
};

const sectionClass = (emphasis: SectionProps['emphasis'], className?: string) =>
  cn(
    'min-w-0 rounded-lg border bg-background',
    emphasis === 'action' && 'border-primary/30',
    className,
  );

const headerClass = (emphasis: SectionProps['emphasis']) =>
  cn(
    'flex items-center gap-2 rounded-t-lg border-b bg-muted/50 px-3 py-2 text-sm font-semibold',
    emphasis === 'action' && 'border-primary/20 bg-primary/5',
  );

const hintOf = (hint: ReactNode) => (typeof hint === 'string' ? <InfoTip text={hint} /> : hint);

const BODY_CLASS = 'flex min-w-0 flex-col gap-4 p-3';

export function WorkflowSection(props: SectionProps) {
  if (props.collapsible) return <CollapsibleSection {...props} />;
  const { title, children, hint, emphasis = 'neutral', className } = props;
  return (
    <section aria-label={title} className={sectionClass(emphasis, className)}>
      <h3 className={headerClass(emphasis)}>
        {title}
        {hintOf(hint)}
      </h3>
      <div className={BODY_CLASS}>{children}</div>
    </section>
  );
}

function CollapsibleSection({
  title,
  children,
  hint,
  emphasis = 'neutral',
  className,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <section aria-label={title} className={sectionClass(emphasis, className)}>
        {/* The trigger's overlay stretches over the bar, so a click anywhere on it toggles. */}
        <div
          className={cn(
            headerClass(emphasis),
            'relative transition-colors hover:bg-muted active:bg-muted/80',
            !open && 'rounded-b-lg border-b-transparent',
          )}
        >
          <h3 className="min-w-0">
            <CollapsibleTrigger className="text-left after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
              {title}
            </CollapsibleTrigger>
          </h3>
          {hint && <span className="relative z-10 flex">{hintOf(hint)}</span>}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              'ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </div>
        {/* Kept mounted while folded so an unsaved draft inside survives. */}
        <CollapsibleContent forceMount className={cn(BODY_CLASS, 'data-[state=closed]:hidden')}>
          {children}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
