import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { t } from '@/shared/i18n';
export function FieldError({ message, id }: { message: string; id?: string }) {
  return (
    <Alert id={id} variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{t().common.error}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
