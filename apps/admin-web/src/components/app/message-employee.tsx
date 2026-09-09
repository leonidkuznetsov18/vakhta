import { useEffect, useState } from 'react';
import type { EmployeeView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Feedback } from '@/components/app/feedback';
import { FormField, SelectField } from '@/components/app/fields';
import { Muted } from '@/components/app/page';
import { employeesApi } from '@/api';
import { describeError } from '@/errors';
import { currentLocale } from '@/i18n';
import { isBlank } from '@/lib/forms';
import { notifySuccess } from '@/lib/toast';

/**
 * "Write to an employee" from anywhere in the panel: pick the person, type, send. The message goes
 * to their bot and nothing else changes, so it needs no section of its own — a master who has to
 * find the right shift row first will simply pick up the phone instead.
 */
export function MessageEmployeeDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = messages(currentLocale()).admin.message;
  const [people, setPeople] = useState<EmployeeView[] | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read when the dialog opens, not when the panel starts: most sessions never send a message.
  useEffect(() => {
    if (!open || people) return;
    let alive = true;
    employeesApi
      .list()
      .then((list) => alive && setPeople(list))
      .catch((e: unknown) => alive && setError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [open, people]);

  const reachable = (people ?? []).filter((e) => e.status === 'ACTIVE' && e.telegramLinked);

  function send() {
    if (!employeeId || isBlank(text)) return;
    setBusy(true);
    setError(null);
    employeesApi
      .message(employeeId, text.trim())
      .then((sent) => {
        notifySuccess(format(t.sent, { employee: sent.fullName }));
        setText('');
        setEmployeeId('');
        onOpenChange(false);
      })
      .catch((e: unknown) => setError(describeError(e)))
      .finally(() => setBusy(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* A phone gets the whole screen: a small box in the middle leaves the keyboard covering the
          field being typed into. The close button of the dialog stays where it always is. */}
      <DialogContent className="max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:grid-rows-[auto_1fr] max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex min-h-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <SelectField
            label={t.employee}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="…"
            required
            disabled={people === null}
            options={reachable.map((e) => ({
              value: e.id,
              label: `${e.fullName} · ${e.personnelNumber}`,
            }))}
          />
          {/* Only people with a bot are offered: a message to anyone else would sit in the outbox
              waiting for a Telegram account that does not exist. */}
          {people !== null && reachable.length === 0 && <Muted>{t.nobody}</Muted>}
          {/* The message is the point of the dialog, so it takes the room: six lines on a desktop
              and everything left over on a phone. */}
          <FormField label={t.text} className="flex min-h-0 flex-1 flex-col">
            {(id) => (
              <Textarea
                id={id}
                rows={6}
                className="min-h-32 flex-1"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.placeholder}
                minLength={3}
                required
              />
            )}
          </FormField>
          <Feedback error={error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {messages(currentLocale()).ui.common.cancel}
            </Button>
            <Button type="submit" variant="success" disabled={busy || !employeeId || isBlank(text)}>
              {t.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
