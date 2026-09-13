import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { messages } from '@vakhta/i18n';
import {
  Maximize2Icon,
  Minimize2Icon,
  MinusIcon,
  MessageSquareIcon,
  Trash2Icon,
} from 'lucide-react';
import { currentLocale } from '@/i18n';
import { useNavigation } from '@/navigation';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
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
      element.style.height = media.matches
        ? `${window.visualViewport?.height ?? window.innerHeight}px`
        : '';
      element.style.top = media.matches ? `${window.visualViewport?.offsetTop ?? 0}px` : '';
    };
    adapt();
    media.addEventListener('change', adapt);
    window.visualViewport?.addEventListener('resize', adapt);
    window.visualViewport?.addEventListener('scroll', adapt);
    const back = () => {
      if (!window.history.state?.communicationDock) draft.minimize();
    };
    window.addEventListener('popstate', back);
    element.focus({ preventScroll: true });
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
  if (!state.open)
    return hasDraft(state)
      ? createPortal(
          <Button
            className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 min-h-11 shadow-lg"
            onClick={() => draft.open()}
          >
            <MessageSquareIcon />
            {t.restore}
          </Button>,
          document.body,
        )
      : null;
  return createPortal(
    <aside
      ref={bindSurface}
      tabIndex={-1}
      aria-label={t.title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          draft.minimize();
        }
      }}
      className={`fixed inset-y-0 right-0 z-50 flex w-full min-w-0 flex-col bg-background text-foreground shadow-[-12px_0_40px_-16px_#0003] outline-none max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11 md:inset-y-3 md:right-3 md:rounded-2xl ${state.expanded ? 'md:w-[min(860px,calc(100vw-2rem))]' : 'md:w-[480px]'}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquareIcon className="size-5" />
          {t.title}
        </h2>
        <div className="flex items-center gap-1">
          <IconButton
            icon={state.expanded ? Minimize2Icon : Maximize2Icon}
            label={t.expand}
            tooltip={t.expand}
            size="icon"
            variant="ghost"
            className="hidden md:inline-flex"
            onClick={() => draft.update({ expanded: !state.expanded })}
          />
          <IconButton
            icon={MinusIcon}
            label={t.minimize}
            tooltip={t.minimize}
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
    </aside>,
    document.body,
  );
}
