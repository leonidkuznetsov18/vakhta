import type { ReactNode } from 'react';
import { messages } from '@vakhta/i18n';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/app/logo';
import { LanguageSwitcher, currentLocale } from '@/i18n';
import { tenantConfig } from '@/shared/config/tenant';

/**
 * The frame of every signed-out screen (sign-in, invitation): brand, title, content and the
 * language switcher last, so the language is always found in the same place.
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
  const displayName = tenantConfig()?.displayName ?? messages(currentLocale()).admin.productName;
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full min-w-0 max-w-sm">
        <CardHeader>
          <div className="flex min-w-0 items-center gap-3 font-semibold">
            <LogoMark className="size-12" />
            <span className="break-words [overflow-wrap:anywhere]">{displayName}</span>
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
