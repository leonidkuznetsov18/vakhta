import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from 'cn';

/** One search affordance for local tables and server-paginated collections. */
export function TableSearch({
  value,
  onChange,
  label,
  placeholder,
  id,
  maxLength,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  id?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full max-w-sm', className)}>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        placeholder={placeholder ?? label}
        maxLength={maxLength}
        className="pl-8"
      />
    </div>
  );
}
