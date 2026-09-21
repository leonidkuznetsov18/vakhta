import type { TenantDetailView } from '@vakhta/contracts';
import { TenantSecretKind } from '@vakhta/domain';
import { Database, HardDrive, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { currentLocale, t } from '@/shared/i18n';
import { DetailList } from '@/shared/ui/detail-list';

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(currentLocale()) : t().workspace.never;
}

export function DatabaseTab({ detail }: { detail: TenantDetailView }) {
  const m = t().workspace;
  const credentials = detail.secrets.find(
    (secret) => secret.kind === TenantSecretKind.DATABASE_URL,
  );
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="size-4" />
            {m.database}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="break-words text-xl font-semibold [overflow-wrap:anywhere]">
            {detail.databaseName}
          </div>
          <DetailList
            rows={[
              { label: m.schemaVersion, value: detail.schemaVersion ?? m.never },
              { label: m.migratedAt, value: formatDate(detail.migratedAt) },
              { label: m.technical.tenantId, value: detail.id },
              { label: t().create.slug, value: detail.slug },
            ]}
          />
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4" />
            {m.technical.connection}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DetailList
            rows={[
              {
                label: m.technical.credentials,
                value: credentials?.present ? m.present : m.absent,
              },
              {
                label: m.technical.credentialsUpdated,
                value: formatDate(credentials?.updatedAt ?? null),
              },
              { label: m.technical.isolation, value: m.technical.dedicatedDatabase },
              { label: t().create.timezone, value: detail.timezone },
            ]}
          />
          <p className="text-sm leading-relaxed text-muted-foreground">
            {m.technical.registryHint}
          </p>
        </CardContent>
      </Card>
      <Card className="min-w-0 xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HardDrive className="size-4" />
            {m.technical.storage}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DetailList
            rows={[
              { label: m.technical.storagePrefix, value: detail.storagePrefix || m.absent },
              { label: m.technical.createdAt, value: formatDate(detail.createdAt) },
              { label: m.technical.updatedAt, value: formatDate(detail.updatedAt) },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
