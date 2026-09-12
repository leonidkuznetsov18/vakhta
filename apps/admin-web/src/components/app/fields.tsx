import { useId, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronsUpDownIcon, PlusIcon, XIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InfoTip } from '@/components/app/info-tip';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';
import { FieldAccessibility } from '@/shared/ui/field-accessibility';

interface FormFieldProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly optional?: boolean;
  readonly className?: string;
  /** Render prop receives the id to attach to the control so the label targets it. */
  readonly children: (id: string) => ReactNode;
}

/** Label + control + optional info tooltip and inline validation error. */
export function FormField({ label, hint, error, optional, className, children }: FormFieldProps) {
  const id = useId();
  const t = messages(currentLocale()).ui.common;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center gap-1">
        <Label htmlFor={id}>
          {label}
          {optional ? (
            <span className="ml-1 font-normal text-muted-foreground">({t.optional})</span>
          ) : null}
        </Label>
        {hint ? <InfoTip text={hint} /> : null}
      </div>
      <FieldAccessibility value={error ? { errorId: `${id}-error`, invalid: true } : {}}>
        {children(id)}
      </FieldAccessibility>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface Option {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly Option[];
  readonly placeholder?: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  /**
   * Long lists become a combobox with a search box; short ones stay a native select. Set it to
   * force one or the other.
   */
  readonly searchable?: boolean;
  /**
   * Lets the person add what the list lacks: when the search text matches no option, one more
   * item offers to create it. Forces the searchable form.
   */
  readonly onCreate?: (name: string) => void;
  readonly createLabel?: string;
}

/** Above this many options a plain select is slower to use than typing a few letters. */
const SEARCHABLE_FROM = 8;

/**
 * Native select styled by shadcn for short lists (keyboard, screen readers and jsdom tests alike);
 * a searchable combobox for long ones, so an employee among a hundred is found by typing.
 */
export function SelectField(props: SelectFieldProps) {
  const searchable =
    props.onCreate !== undefined || (props.searchable ?? props.options.length > SEARCHABLE_FROM);
  return searchable ? <ComboboxField {...props} /> : <NativeSelectField {...props} />;
}

function ComboboxField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  required,
  disabled,
  className,
  onCreate,
  createLabel,
}: SelectFieldProps) {
  const t = messages(currentLocale()).ui.common;
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [query, setQuery] = useState('');
  const popupId = useId();
  const creatable =
    onCreate !== undefined &&
    query.trim().length > 0 &&
    !options.some((o) => o.label.trim().toLocaleLowerCase() === query.trim().toLocaleLowerCase());
  const selected = options.find((o) => o.value === value) ?? null;
  const validationError = error || (invalid && required && !selected ? t.required : undefined);
  const choose = (next: string) => {
    onChange(next);
    setInvalid(false);
    setOpen(false);
  };
  return (
    <FormField label={label} hint={hint} error={validationError} className={className}>
      {(id) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? popupId : undefined}
              aria-haspopup="dialog"
              aria-required={required}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? `${id}-error` : undefined}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
              disabled={disabled}
              className={cn(
                'w-full justify-between font-normal',
                !selected && 'text-muted-foreground',
              )}
            >
              <span className="truncate">{selected?.label ?? placeholder ?? '…'}</span>
              <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          {required && (
            <select
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
              required
              disabled={disabled}
              value={selected?.value ?? ''}
              onChange={(event) => choose(event.target.value)}
              onInvalid={(event) => {
                event.preventDefault();
                setInvalid(true);
                document.getElementById(id)?.focus();
              }}
            >
              <option value="" />
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          <PopoverContent
            id={popupId}
            aria-label={label}
            className="w-(--radix-popover-trigger-width) min-w-64 p-0"
            align="start"
          >
            <Command loop>
              <CommandInput
                aria-label={`${label}: ${t.search}`}
                placeholder={t.search}
                value={query}
                onValueChange={setQuery}
              />
              <CommandList aria-label={label}>
                <CommandEmpty>{t.noResults}</CommandEmpty>
                {creatable && (
                  // Its own always-mounted group: cmdk hides a group whose items matched nothing.
                  <CommandGroup forceMount>
                    <CommandItem
                      forceMount
                      value={query.trim()}
                      onSelect={() => {
                        onCreate(query.trim());
                        setQuery('');
                        setOpen(false);
                      }}
                    >
                      <PlusIcon className="size-4 opacity-60" aria-hidden="true" />
                      <span className="truncate">
                        {createLabel ?? t.create}: «{query.trim()}»
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup>
                  {placeholder !== undefined && value !== '' && (
                    <CommandItem
                      value={`__clear__ ${placeholder}`}
                      onSelect={() => {
                        choose('');
                      }}
                    >
                      <XIcon className="size-4 opacity-60" aria-hidden="true" />
                      {placeholder}
                    </CommandItem>
                  )}
                  {options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.value}`}
                      onSelect={() => {
                        choose(o.value);
                      }}
                    >
                      <CheckIcon
                        className={cn('size-4', o.value === value ? 'opacity-100' : 'opacity-0')}
                        aria-hidden="true"
                      />
                      <span className="truncate">{o.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  );
}

function NativeSelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  required,
  disabled,
  className,
}: SelectFieldProps) {
  return (
    <FormField label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <NativeSelect
          className="w-full"
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
        >
          {placeholder !== undefined ? (
            <NativeSelectOption value="">{placeholder}</NativeSelectOption>
          ) : null}
          {options.map((o) => (
            <NativeSelectOption key={o.value} value={o.value}>
              {o.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}
