import { useState } from 'react';
import { ClockIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const t = messages(currentLocale()).unitShifts;

const STEP_MINUTES = 30;
const TIMES = Array.from({ length: (24 * 60) / STEP_MINUTES }, (_, index) =>
  clockTime(index * STEP_MINUTES),
);

/**
 * A typed time with a list of half-hour times behind the clock button. The native picker cannot
 * be closed by its own icon, so the clock toggles this list instead; other minutes are typed.
 */
export function TimeField({
  id,
  value,
  onChange,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const choose = (time: string) => {
    onChange(time);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <InputGroup className="h-9">
          <InputGroupInput
            id={id}
            type="time"
            step={60}
            required
            className="text-base tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <PopoverTrigger asChild>
              <InputGroupButton size="icon-xs" aria-label={t.chooseTime}>
                <ClockIcon aria-hidden="true" />
              </InputGroupButton>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-32 p-0">
        <Command loop defaultValue={value} tabIndex={0} className="outline-none">
          <CommandList label={t.chooseTime} className="max-h-60">
            <CommandGroup>
              {TIMES.map((time) => (
                <CommandItem
                  key={time}
                  value={time}
                  data-checked={time === value}
                  ref={time === value ? centerInList : undefined}
                  className="tabular-nums"
                  onSelect={() => choose(time)}
                >
                  {time}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Opens the list at the current time without scrolling the page behind the popover. */
function centerInList(item: HTMLElement | null) {
  const list = item?.closest('[cmdk-list]');
  if (!item || !(list instanceof HTMLElement)) return;
  const offset = item.getBoundingClientRect().top - list.getBoundingClientRect().top;
  list.scrollTop += offset - (list.clientHeight - item.offsetHeight) / 2;
}

function clockTime(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}
