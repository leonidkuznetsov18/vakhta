import { AlertCircleIcon, TriangleAlertIcon } from 'lucide-react';
import type { EligibilityReason } from '@vakhta/domain';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { reasonText } from '../model/use-eligibility';

/**
 * Eligibility reasons rendered with the same typography as every other inline error: one alert
 * per reason, red for blocking conflicts and orange for warnings (palette rule in AGENTS.md).
 */
export function ReasonAlerts({
  reasons,
  labels,
  label,
}: {
  readonly reasons: readonly EligibilityReason[];
  readonly labels: Parameters<typeof reasonText>[1];
  readonly label: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label={label}>
      {reasons.map((reason, index) => (
        <li key={index}>
          <Alert
            variant={reason.severity === 'BLOCK' ? 'destructive' : 'warning'}
            role={reason.severity === 'BLOCK' ? 'alert' : 'status'}
          >
            {reason.severity === 'BLOCK' ? <AlertCircleIcon /> : <TriangleAlertIcon />}
            <AlertTitle>{reasonText(reason, labels)}</AlertTitle>
          </Alert>
        </li>
      ))}
    </ul>
  );
}
