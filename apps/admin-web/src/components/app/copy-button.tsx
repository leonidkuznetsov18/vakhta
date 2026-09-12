import { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { IconButton } from '@/shared/ui/icon-button';
import { currentLocale } from '@/i18n';

/** Copies a value; hidden where the Clipboard API is unavailable (http kiosk, old browsers). */
export function CopyButton({ value }: { readonly value: string }) {
  const [done, setDone] = useState(false);
  const t = messages(currentLocale()).ui.common;
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
  if (!canCopy) return null;
  return (
    <IconButton
      icon={done ? CheckIcon : CopyIcon}
      label={done ? t.copied : t.copy}
      tooltip={done ? t.copied : t.copy}
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => setDone(true))
          .catch(() => setDone(false));
      }}
    />
  );
}
