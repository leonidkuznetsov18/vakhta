import { cn } from 'cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from './avatar';

export interface StackedPerson {
  readonly id: string;
  readonly name: string;
  /** Seeds the placeholder colour, so the same person keeps the same circle everywhere. */
  readonly seed?: string;
  readonly image?: string | null;
  /** Shown under the name in the tooltip: a personnel number, a unit, a state. */
  readonly note?: string | null;
}

/**
 * A row of overlapping avatars with a "+N" tail, after shadcncraft's avatar stack — with the part
 * it lacks: pointing at the stack names the people. A count alone ("3 employees") is something to
 * read, a face with a name is something to act on, and that is the whole point of the overview.
 */
export function AvatarStack({
  people,
  max = 5,
  size = 28,
  overlapRatio = 0.3,
  className,
}: {
  readonly people: readonly StackedPerson[];
  readonly max?: number;
  readonly size?: number;
  readonly overlapRatio?: number;
  readonly className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const overlap = Math.round(size * overlapRatio);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Focusable: the names have to be reachable without a mouse. */}
        <span
          tabIndex={0}
          className={cn(
            'inline-flex items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            className,
          )}
          style={{ paddingRight: overlap }}
        >
          {shown.map((person) => (
            <span
              key={person.id}
              className="rounded-full ring-2 ring-background transition-transform hover:z-10"
              style={{ marginRight: -overlap, width: size, height: size }}
            >
              <UserAvatar
                name={person.name}
                email={person.seed ?? person.id}
                image={person.image ?? null}
                className="size-full"
              />
            </span>
          ))}
          {rest > 0 && (
            <span
              className="flex items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-background tabular-nums"
              style={{ marginRight: -overlap, width: size, height: size }}
            >
              +{rest}
            </span>
          )}
        </span>
      </TooltipTrigger>
      {/* Names only: whatever the stack sits next to already says what these people have in
          common, and repeating it in the tooltip is one more thing to read for nothing. */}
      <TooltipContent className="max-w-72">
        <ul className="flex flex-col gap-0.5">
          {people.map((person) => (
            <li key={person.id}>
              {person.name}
              {person.note ? <span className="opacity-70"> · {person.note}</span> : null}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
