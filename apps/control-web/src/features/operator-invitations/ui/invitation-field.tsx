import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';

export function InvitationField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        <span>{label}</span>
        {children}
      </label>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      ) : null}
    </div>
  );
}
