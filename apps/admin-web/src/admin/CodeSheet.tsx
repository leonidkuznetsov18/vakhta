import type { ActivationCodeIssued, EmployeeView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { QrCode } from '@/components/app/qr-code';
import { formatDateTime } from '@/lib/format';
import { currentLocale } from '../i18n.tsx';

const all = messages(currentLocale());
const e = all.admin.administration.employees;

function botName(deepLink: string): string {
  const m = /t\.me\/([A-Za-z0-9_]+)/.exec(deepLink);
  return m?.[1] ?? '';
}

/**
 * Printable sheet with one card per employee: name, number, activation code and its QR.
 * Codes are shown once, so the sheet is the moment to print or hand them out.
 */
export function CodeSheet({
  codes,
  employees,
  onClose,
}: {
  readonly codes: ActivationCodeIssued[] | null;
  readonly employees: readonly EmployeeView[];
  readonly onClose: () => void;
}) {
  const byId = new Map(employees.map((x) => [x.id, x]));
  const first = codes?.[0];
  return (
    <Dialog open={codes !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="print:static print:max-w-none print:translate-x-0 print:translate-y-0 print:border-0 print:shadow-none sm:max-w-4xl">
        <DialogHeader className="no-print">
          <DialogTitle>{e.codeSheetTitle}</DialogTitle>
          <DialogDescription>
            {first
              ? format(e.codeSheetHint, {
                  bot: botName(first.deepLink),
                  expires: formatDateTime(first.expiresAt),
                })
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto sm:grid-cols-2 print:max-h-none print:grid-cols-3 print:overflow-visible">
          {(codes ?? []).map((c) => {
            const emp = byId.get(c.employeeId);
            return (
              <div
                key={c.employeeId}
                className="flex items-center gap-3 rounded-lg border p-3 print:break-inside-avoid"
              >
                <QrCode value={c.deepLink} size={112} label={emp?.fullName ?? c.employeeId} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{emp?.fullName ?? c.employeeId}</div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {emp?.personnelNumber ?? ''}
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold tracking-widest">
                    {c.code}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(c.expiresAt)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="no-print">
          <Button type="button" variant="outline" onClick={onClose}>
            {all.ui.common.close}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            <PrinterIcon aria-hidden="true" />
            {e.printCodes}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
