import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** A dataset filter uses single-choice semantics, not tabs pointing to nonexistent panels. */
export function StateFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      aria-label={label}
      className="max-w-full flex-wrap rounded-lg bg-muted p-0.5"
      spacing={0}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="max-md:h-9 rounded-md! data-[state=on]:bg-background data-[state=on]:shadow-sm"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
