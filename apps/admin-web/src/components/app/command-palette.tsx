import { useEffect, useState } from 'react';
import type { EmployeeView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { SearchIcon, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { InfoTip } from '@/components/app/info-tip';
import { employeesApi } from '@/api';
import { currentLocale } from '@/i18n';
import type { SectionKey } from '@/navigation';

interface Props {
  readonly sections: readonly { key: SectionKey; icon: LucideIcon }[];
  readonly onSection: (key: SectionKey) => void;
  readonly onEmployee: (employee: EmployeeView) => void;
  readonly canSeeEmployees: boolean;
}

/**
 * ⌘K / Ctrl+K palette: jump to a section or open an employee card by name or number. The
 * employee list is fetched on first open, so the rest of the panel pays nothing for it.
 */
export function CommandPalette({ sections, onSection, onEmployee, canSeeEmployees }: Props) {
  const t = messages(currentLocale());
  const c = t.ui.common;
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeView[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || employees !== null || !canSeeEmployees) return;
    employeesApi
      .list()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, [open, employees, canSeeEmployees]);

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          <SearchIcon aria-hidden="true" />
          <span className="hidden sm:inline">{c.commandPalette}</span>
          <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
            ⌘K
          </kbd>
        </Button>
        <InfoTip text={t.ui.hints.commandPalette} />
      </div>
      <CommandDialog open={open} onOpenChange={setOpen} title={c.commandPalette}>
        <CommandInput placeholder={c.commandPlaceholder} />
        <CommandList>
          <CommandEmpty>{c.noResults}</CommandEmpty>
          <CommandGroup heading={c.commandSections}>
            {sections.map(({ key, icon: Icon }) => (
              <CommandItem
                key={key}
                value={`${t.admin.sections[key]} ${key}`}
                onSelect={() => {
                  setOpen(false);
                  onSection(key);
                }}
              >
                <Icon aria-hidden="true" />
                {t.admin.sections[key]}
                <CommandShortcut>{key}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          {employees && employees.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={c.commandEmployees}>
                {employees.map((emp) => (
                  <CommandItem
                    key={emp.id}
                    value={`${emp.fullName} ${emp.personnelNumber}`}
                    onSelect={() => {
                      setOpen(false);
                      onEmployee(emp);
                    }}
                  >
                    {emp.fullName}
                    <CommandShortcut className="tabular-nums">
                      {emp.personnelNumber}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
