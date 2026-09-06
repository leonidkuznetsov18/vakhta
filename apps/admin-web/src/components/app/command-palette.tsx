import { useEffect, useState } from 'react';
import type {
  ChecklistDefinitionView,
  EmployeeView,
  OrgSnapshot,
  TerminalView,
} from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import {
  ClipboardListIcon,
  MonitorIcon,
  PlusIcon,
  SearchIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';
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
import { checklistsApi, employeesApi, orgApi } from '@/api';
import { currentLocale } from '@/i18n';
import type { SectionKey } from '@/navigation';

/** A place the palette can jump to: a section, its tab and, optionally, the row to open. */
export interface PaletteTarget {
  readonly section: SectionKey;
  readonly sub?: string;
  /** localStorage key (without the `vakhta.ui.` prefix) that the page reads to open a row. */
  readonly openKey?: string;
  readonly openId?: string;
}

interface Props {
  readonly sections: readonly { key: SectionKey; icon: LucideIcon }[];
  readonly onSection: (key: SectionKey) => void;
  readonly onEmployee: (employee: EmployeeView) => void;
  readonly onTarget: (target: PaletteTarget) => void;
  readonly canSeeEmployees: boolean;
  readonly canAdminister: boolean;
}

interface Index {
  readonly employees: EmployeeView[];
  readonly checklists: ChecklistDefinitionView[];
  readonly terminals: TerminalView[];
}

/**
 * ⌘K / Ctrl+K palette in the spirit of documentation sites: type a few letters and jump to a
 * section, a quick action, an employee, a checklist or a terminal. The index is fetched on the
 * first open only, so the rest of the panel pays nothing for it.
 */
export function CommandPalette({
  sections,
  onSection,
  onEmployee,
  onTarget,
  canSeeEmployees,
  canAdminister,
}: Props) {
  const t = messages(currentLocale());
  const c = t.ui.common;
  const a = t.admin.administration;
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<Index | null>(null);

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
    if (!open || index !== null) return;
    const empty: Index = { employees: [], checklists: [], terminals: [] };
    Promise.all([
      canSeeEmployees ? employeesApi.list().catch(() => []) : Promise.resolve([]),
      canAdminister ? checklistsApi.list().catch(() => []) : Promise.resolve([]),
      canAdminister ? orgApi.snapshot().catch(() => null) : Promise.resolve(null),
    ])
      .then(([employees, checklists, org]) =>
        setIndex({
          employees,
          checklists,
          terminals: (org as OrgSnapshot | null)?.terminals ?? [],
        }),
      )
      .catch(() => setIndex(empty));
  }, [open, index, canSeeEmployees, canAdminister]);

  const go = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const actions: readonly { key: string; label: string; target: PaletteTarget }[] = canAdminister
    ? [
        {
          key: 'employee',
          label: a.employees.create,
          target: { section: 'administration', sub: 'employees' },
        },
        {
          key: 'checklist',
          label: a.checklists.create,
          target: { section: 'administration', sub: 'checklists' },
        },
        {
          key: 'terminal',
          label: a.terminals.register,
          target: { section: 'administration', sub: 'terminals' },
        },
        { key: 'user', label: a.users.create, target: { section: 'administration', sub: 'users' } },
      ]
    : [];

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
                onSelect={() => go(() => onSection(key))}
              >
                <Icon aria-hidden="true" />
                {t.admin.sections[key]}
                <CommandShortcut>{key}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
          {actions.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={c.commandActions}>
                {actions.map((action) => (
                  <CommandItem
                    key={action.key}
                    value={`${action.label} ${action.key}`}
                    onSelect={() => go(() => onTarget(action.target))}
                  >
                    <PlusIcon aria-hidden="true" />
                    {action.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {index && index.employees.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={c.commandEmployees}>
                {index.employees.map((emp) => (
                  <CommandItem
                    key={emp.id}
                    value={`${emp.fullName} ${emp.personnelNumber}`}
                    onSelect={() => go(() => onEmployee(emp))}
                  >
                    <UserIcon aria-hidden="true" />
                    {emp.fullName}
                    <CommandShortcut className="tabular-nums">
                      {emp.personnelNumber}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {index && index.checklists.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={c.commandChecklists}>
                {index.checklists.map((cl) => (
                  <CommandItem
                    key={cl.id}
                    value={`${cl.name} ${cl.positions.map((p) => p.name).join(' ')}`}
                    onSelect={() =>
                      go(() =>
                        onTarget({
                          section: 'administration',
                          sub: 'checklists',
                          openKey: 'checklists.open',
                          openId: cl.id,
                        }),
                      )
                    }
                  >
                    <ClipboardListIcon aria-hidden="true" />
                    {cl.name}
                    <CommandShortcut>{cl.positions.map((p) => p.name).join(', ')}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {index && index.terminals.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading={c.commandTerminals}>
                {index.terminals.map((term) => (
                  <CommandItem
                    key={term.id}
                    value={`${term.name} terminal`}
                    onSelect={() =>
                      go(() => onTarget({ section: 'administration', sub: 'terminals' }))
                    }
                  >
                    <MonitorIcon aria-hidden="true" />
                    {term.name}
                    <CommandShortcut>{a.terminals.statuses[term.status]}</CommandShortcut>
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
