import React, { useCallback, useState } from 'react';
import { messages } from '@vakhta/i18n';
import { describeError } from '../errors.ts';
import { currentLocale } from '../i18n.tsx';

const c = messages(currentLocale()).admin.administration.common;

/** Стан однієї дії: зайнято / помилка / підтвердження. Спільний для всіх вкладок. */
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
  return { busy, error, notice, run, setNotice };
}

export function Feedback({
  error,
  notice,
}: {
  readonly error: string | null;
  readonly notice: string | null;
}) {
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="notice">{notice}</p>}
    </>
  );
}

/** Кнопка «скопіювати», яка не ламається без Clipboard API (http-кіоск, старий браузер). */
export function CopyButton({ value }: { readonly value: string }) {
  const [done, setDone] = useState(false);
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
  if (!canCopy) return null;
  return (
    <button
      type="button"
      className="link"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => setDone(true))
          .catch(() => setDone(false));
      }}
    >
      {done ? c.copied : c.copy}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
