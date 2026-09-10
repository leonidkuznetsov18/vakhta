import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';

/** Inline error of the last action, placed next to the form that caused it. */
export function Feedback({
  error,
}: {
  readonly error: string | null;
  readonly notice?: string | null;
}) {
  if (!error) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <AlertTitle>{error}</AlertTitle>
    </Alert>
  );
}
