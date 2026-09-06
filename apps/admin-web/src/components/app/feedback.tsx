import { useCallback, useState } from 'react';
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { describeError } from '@/errors';

/** One in-flight action with its error and success notice; shared by every page. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = useCallback(async (action: () => Promise<void>, done?: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (done) setNotice(done);
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, notice, run, setError, setNotice };
}

/** Inline result of the last action: a destructive alert for errors, a quiet one for success. */
export function Feedback({
  error,
  notice,
}: {
  readonly error: string | null;
  readonly notice: string | null;
}) {
  if (!error && !notice) return null;
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircleIcon />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
      {notice ? (
        <Alert role="status">
          <CheckCircle2Icon />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
