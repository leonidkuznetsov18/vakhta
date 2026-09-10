import { createContext, use } from 'react';

export const FieldAccessibility = createContext<{
  readonly errorId?: string;
  readonly invalid?: boolean;
}>({});

/** Native controls share their field's error association without DOM mutation. */
export function useFieldAccessibility(props: {
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
}) {
  const field = use(FieldAccessibility);
  return {
    'aria-invalid': props['aria-invalid'] ?? field.invalid,
    'aria-describedby':
      [props['aria-describedby'], field.errorId].filter(Boolean).join(' ') || undefined,
  };
}
