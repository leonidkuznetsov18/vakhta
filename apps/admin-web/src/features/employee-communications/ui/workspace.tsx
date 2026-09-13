import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { messages } from '@vakhta/i18n';
import { XIcon, MessageSquareIcon, Trash2Icon } from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useCommunicationDraft } from '../model/context';
import { hasDraft } from '../model/draft';
import { Compose } from './compose';
import { CommunicationHistory } from './history';
export function CommunicationLauncher({ compact = false }: { compact?: boolean }) {
  const t = messages(currentLocale()).communications;
  const draft = useCommunicationDraft();
  const { roles } = useNavigation();
  if (!roles.some((role) => ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER'].includes(role)))
    return null;
  return compact ? (
    <IconButton
      icon={MessageSquareIcon}
      label={t.compose}
      tooltip={t.compose}
      size="icon"
      variant="ghost"
      data-communications-trigger
      onClick={() => draft.open()}
    />
  ) : (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start"
      data-communications-trigger
      onClick={() => draft.open()}
    >
      <MessageSquareIcon />
      <span className="group-data-[collapsible=icon]:hidden">{t.compose}</span>
    </Button>
  );
}
export function CommunicationWorkspace() {
  const t = messages(currentLocale()).communications;
  const draft = useCommunicationDraft();
  const state = useStore(draft.store);
  const { roles } = useNavigation();
  const [bindSurface] = useState(() => (element: HTMLElement | null) => {
    if (!element) return;
    const background = document.querySelector<HTMLElement>('[data-communications-background]');
    const media = window.matchMedia('(max-width: 767px)');
    const previousOverflow = document.body.style.overflow;
    const adapt = () => {
      if (background) background.inert = media.matches;
      document.body.style.overflow = media.matches ? 'hidden' : previousOverflow;
      // Visual viewport follows the phone keyboard without hiding the fixed send footer.
      if (media.matches) {
        element.style.setProperty(
          'height',
          `${window.visualViewport?.height ?? window.innerHeight}px`,
          'important',
        );
        element.style.setProperty('top', `${window.visualViewport?.offsetTop ?? 0}px`, 'important');
      } else {
        element.style.removeProperty('height');
        element.style.removeProperty('top');
      }
    };
    adapt();
    media.addEventListener('change', adapt);
    window.visualViewport?.addEventListener('resize', adapt);
    window.visualViewport?.addEventListener('scroll', adapt);
    const back = () => {
      if (media.matches && !window.history.state?.communicationDock) draft.minimize();
    };
    window.addEventListener('popstate', back);
    return () => {
      if (background) background.inert = false;
      document.body.style.overflow = previousOverflow;
      media.removeEventListener('change', adapt);
      window.visualViewport?.removeEventListener('resize', adapt);
      window.visualViewport?.removeEventListener('scroll', adapt);
      window.removeEventListener('popstate', back);
    };
  });
  if (!roles.some((role) => ['ADMIN', 'HR', 'PRODUCTION_HEAD', 'SHIFT_MASTER'].includes(role)))
    return null;
  return (
    <>
      {!state.open &&
        hasDraft(state) &&
        createPortal(
          <Button
            className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 min-h-11 shadow-lg"
            onClick={() => draft.open()}
          >
            <MessageSquareIcon />
            {t.restore}
          </Button>,
          document.body,
        )}
      <Sheet
        modal={false}
        open={state.open}
        onOpenChange={(open) => {
          if (!open) draft.minimize();
        }}
      >
        <SheetContent
          ref={bindSurface}
          tabIndex={-1}
          aria-label={t.title}
          aria-describedby={undefined}
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
          }}
          onEscapeKeyDown={(event) => {
            if (document.activeElement?.matches('[role="combobox"][aria-expanded="true"]'))
              event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('[data-communications-trigger]')
            )
              event.preventDefault();
          }}
          className="inset-y-0! right-0! h-auto! w-full! max-w-none! min-w-0 gap-0 bg-background text-foreground outline-none max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11 md:inset-y-3! md:right-3! md:w-[min(640px,calc(100vw-2rem))]! md:rounded-2xl"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
            <SheetTitle className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareIcon className="size-5" />
              {t.title}
            </SheetTitle>
            <div className="flex items-center gap-1">
              <IconButton
                icon={XIcon}
                label={messages(currentLocale()).ui.common.close}
                tooltip={messages(currentLocale()).ui.common.close}
                size="icon"
                variant="ghost"
                onClick={() => draft.minimize()}
              />
            </div>
          </header>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2 sm:px-5">
            <div className="flex gap-1" role="group" aria-label={t.title}>
              <Button
                aria-pressed={state.view === 'compose'}
                variant={state.view === 'compose' ? 'secondary' : 'ghost'}
                onClick={() => draft.update({ view: 'compose' })}
              >
                {t.compose}
              </Button>
              <Button
                aria-pressed={state.view === 'history'}
                variant={state.view === 'history' ? 'secondary' : 'ghost'}
                onClick={() => draft.update({ view: 'history' })}
              >
                {t.history}
              </Button>
            </div>
            {state.view === 'compose' && (
              <IconButton
                icon={Trash2Icon}
                label={t.discard}
                tooltip={t.discard}
                size="icon"
                variant="ghost"
                disabled={!hasDraft(state) || ['SUBMITTING', 'UNCERTAIN'].includes(state.phase)}
                onClick={() => draft.reset()}
              />
            )}
          </div>
          {state.view === 'compose' ? <Compose /> : <CommunicationHistory />}
        </SheetContent>
      </Sheet>
    </>
  );
}
