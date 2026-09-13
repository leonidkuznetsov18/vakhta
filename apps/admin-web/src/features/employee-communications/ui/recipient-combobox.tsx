import { useId, useState, type ReactNode } from 'react';
import { COMMUNICATION_LIMITS, type CommunicationRecipient } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { CheckIcon, SearchIcon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { Input } from '@/components/ui/input';
import type { ContextRecipient } from '../model/draft';

export function RecipientCombobox({
  search,
  onSearch,
  items,
  selected,
  onToggle,
  feedback,
  footer,
  empty,
}: {
  search: string;
  onSearch: (value: string) => void;
  items: CommunicationRecipient[];
  selected: ContextRecipient[];
  onToggle: (person: CommunicationRecipient) => void;
  feedback: ReactNode;
  footer: ReactNode;
  empty: boolean;
}) {
  const t = messages(currentLocale()).communications;
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const listId = useId();
  const chosen = (person: CommunicationRecipient) => selected.some((row) => row.id === person.id);
  const enabled = (person: CommunicationRecipient) =>
    person.eligible && (chosen(person) || selected.length < COMMUNICATION_LIMITS.recipients);
  const available = items.filter(enabled);
  const active = available.find((person) => person.id === activeId) ?? available[0];
  const optionId = (id: string) => `${listId}-${id}`;
  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
      />
      <Input
        className="h-11 pl-9"
        role="combobox"
        aria-label={t.search}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active ? optionId(active.id) : undefined}
        placeholder={t.search}
        autoComplete="off"
        value={search}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          onSearch(event.target.value);
          setActiveId(null);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            if (!available.length) return;
            let index = available.findIndex((person) => person.id === active?.id);
            if (!open) index = event.key === 'ArrowDown' ? -1 : 0;
            const next =
              available[
                (index + (event.key === 'ArrowDown' ? 1 : -1) + available.length) % available.length
              ];
            if (next) {
              setActiveId(next.id);
              document.getElementById(optionId(next.id))?.scrollIntoView({ block: 'nearest' });
            }
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (open && active) onToggle(active);
            else setOpen(true);
          }
        }}
      />
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border bg-popover text-popover-foreground shadow-xl">
          <div className="px-3 pt-2">{feedback}</div>
          <ul
            id={listId}
            role="listbox"
            aria-label={t.recipients}
            aria-multiselectable="true"
            className="max-h-[min(32dvh,16rem)] overflow-y-auto p-1"
          >
            {items.map((person) => (
              <li
                key={person.id}
                id={optionId(person.id)}
                role="option"
                aria-selected={chosen(person)}
                aria-disabled={!enabled(person)}
                data-active={active?.id === person.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[active=true]:bg-accent hover:bg-accent active:bg-accent/80 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                onMouseDown={(event) => event.preventDefault()}
                onPointerMove={() => {
                  if (enabled(person)) setActiveId(person.id);
                }}
                onClick={() => {
                  if (enabled(person)) onToggle(person);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-medium">{person.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {person.personnelNumber}
                    {person.unitName ? ` · ${person.unitName}` : ''}
                  </span>
                  {person.reason && (
                    <span className="block text-xs text-muted-foreground">
                      {person.reason === 'INACTIVE' ? t.inactive : t.unlinked}
                    </span>
                  )}
                </span>
                {chosen(person) && <CheckIcon aria-hidden className="size-4 shrink-0" />}
              </li>
            ))}
          </ul>
          {empty && (
            <p role="status" className="px-3 py-5 text-sm text-muted-foreground">
              {t.emptyAudience}
            </p>
          )}
          {footer && <div className="border-t px-3 py-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
