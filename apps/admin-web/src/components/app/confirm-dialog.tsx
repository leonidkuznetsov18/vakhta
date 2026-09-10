import { useState, type ReactNode } from 'react';
import { messages } from '@vakhta/i18n';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { focusFirstField } from '@/components/app/focus';
import { currentLocale } from '@/i18n';

export interface ConfirmOptions {
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  /** When set, a textarea with this label is shown and the value is returned. */
  readonly commentLabel?: string;
  readonly commentRequired?: boolean;
  readonly commentMinLength?: number;
  readonly destructive?: boolean;
}

type Resolver = (value: string | false) => void;

/**
 * Replaces window.confirm / window.prompt with an accessible dialog. `confirm()` resolves to
 * the comment (or '' when no comment is requested) on confirmation and to false on cancel.
 */
export function useConfirm() {
  // The question and the promise waiting on its answer are one thing, so they are one piece of
  // state: an open dialog always has someone to answer to, and settling it clears both at once.
  const [asked, setAsked] = useState<{
    readonly options: ConfirmOptions;
    readonly resolve: Resolver;
  } | null>(null);
  const [comment, setComment] = useState('');
  const options = asked?.options ?? null;

  const confirm = (opts: ConfirmOptions): Promise<string | false> => {
    setComment('');
    return new Promise<string | false>((resolve) => setAsked({ options: opts, resolve }));
  };

  const settle = (value: string | false) => {
    asked?.resolve(value);
    setAsked(null);
  };

  const t = messages(currentLocale()).ui.common;
  const min = options?.commentMinLength ?? 3;
  const commentInvalid =
    Boolean(options?.commentLabel) &&
    Boolean(options?.commentRequired) &&
    comment.trim().length < min;

  const dialog: ReactNode = (
    <AlertDialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
      {options ? (
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const content = event.currentTarget as HTMLElement;
            requestAnimationFrame(() => {
              const field = content.querySelector<HTMLElement>('textarea');
              const action = content.querySelector<HTMLElement>('[data-confirm-action]');
              (field ?? (options.destructive ? null : action) ?? content).focus();
              if (!field && !action) focusFirstField(content);
            });
          }}
        >
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              if (!commentInvalid) settle(comment.trim());
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description ? (
                <AlertDialogDescription>{options.description}</AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            {options.commentLabel ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-comment">{options.commentLabel}</Label>
                <Textarea
                  id="confirm-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  minLength={options.commentRequired ? min : undefined}
                />
                <span className="text-xs text-muted-foreground">{t.submitShortcut}</span>
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>{t.cancel}</AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                data-confirm-action
                disabled={commentInvalid}
                variant={options.destructive ? 'destructive' : 'default'}
                onClick={(event) => {
                  event.preventDefault();
                  if (!commentInvalid) settle(comment.trim());
                }}
              >
                {options.confirmLabel ?? t.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      ) : null}
    </AlertDialog>
  );

  return { confirm, dialog };
}
