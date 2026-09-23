import type { ReactNode } from 'react';
import { AlertCircleIcon } from 'lucide-react';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/shared/i18n';
import { LanguageSwitcher } from './language-switcher';

/**
 * The frame of every signed-out screen (sign-in, invitation), matching the tenant panel: brand,
 * title, content and the language switcher last, so the language is always in the same place.
 */
export function AuthScreen({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: ReactNode;
}) {
  const m = t();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full min-w-0 max-w-sm">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3 font-semibold">
            <img src="/favicon.svg" alt="" className="size-12 shrink-0" />
            <span className="break-words [overflow-wrap:anywhere]">{m.productName}</span>
          </div>
          <CardTitle className="break-words">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {children}
          <LanguageSwitcher />
        </CardContent>
      </Card>
    </main>
  );
}

/** A refused form submission, in the same alert as the tenant panel's sign-in. */
export function FormError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon />
      <AlertTitle>{message}</AlertTitle>
    </Alert>
  );
}
