import * as React from 'react';
import { cn } from 'cn';
import { useFieldAccessibility } from '@/shared/ui/field-accessibility';
import { submitFormShortcut } from '@/shared/lib/form-keyboard';

function Textarea({ className, onKeyDown, ...props }: React.ComponentProps<'textarea'>) {
  const accessibility = useFieldAccessibility(props);
  return (
    <textarea
      data-slot="textarea"
      onKeyDown={(event) => {
        onKeyDown?.(event);
        submitFormShortcut(event);
      }}
      className={cn(
        'flex field-sizing-content min-h-16 max-md:min-h-28 max-md:max-h-72 max-md:overflow-y-auto w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
      {...accessibility}
    />
  );
}

export { Textarea };
