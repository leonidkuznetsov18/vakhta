import { useId, type ReactNode } from 'react';
import { messages } from '@vakhta/i18n';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { InfoTip } from '@/components/app/info-tip';
import { currentLocale } from '@/i18n';
import { cn } from 'cn';

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
      <div className="flex items-center gap-1">
        <Label htmlFor={id}>
          {label}
          {optional ? (
            <span className="ml-1 font-normal text-muted-foreground">({t.optional})</span>
          ) : null}
        </Label>
        {hint ? <InfoTip text={hint} /> : null}
      </div>
      {children(id)}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
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
}

/** Native select styled by shadcn: works with keyboard, screen readers and jsdom tests alike. */
export function SelectField({
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
