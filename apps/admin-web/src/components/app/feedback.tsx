import { useCallback, useState } from 'react';
import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { describeError } from '@/errors';
import { notifySuccess } from '@/lib/toast';

/** One in-flight action with its error; successes are announced with a toast. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>, done?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (done) notifySuccess(done);
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

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
