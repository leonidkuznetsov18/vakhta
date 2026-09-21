import { useState } from 'react';
import type { TenantDetailView } from '@vakhta/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ControlApiError } from '@/shared/api';
import { t } from '@/shared/i18n';

export type Refresh = () => Promise<unknown>;
export interface TabProps {
  detail: TenantDetailView;
  onChanged: Refresh;
}

export function describeError(error: unknown): string {
  return error instanceof ControlApiError ? `${error.code}: ${error.message}` : t().common.error;
}

export function InfoCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {lines.map((line, index) => (
          <div
            key={`${index}-${line}`}
            className={index === 0 ? 'font-medium' : 'text-muted-foreground'}
          >
            {line}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CopyButton({ value }: { value: string }) {
  const m = t().workspace;
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? m.copied : m.copy}
    </Button>
  );
}

/** Primary host per surface, indexed once. */
export function primaryHosts(detail: TenantDetailView): Map<string, string> {
  const hosts = new Map<string, string>();
  for (const domain of detail.domains) {
    if (domain.isPrimary || !hosts.has(domain.surface)) hosts.set(domain.surface, domain.host);
  }
  return hosts;
}

export function secretPresent(detail: TenantDetailView, kind: string): boolean {
  return detail.secrets.some((s) => s.kind === kind && s.present);
}
