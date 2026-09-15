import { useRouter } from '@tanstack/react-router';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { createCommunicationDraft, type DraftController } from './draft';
const DraftContext = createContext<DraftController | null>(null);
export function CommunicationProvider({ children }: { children: ReactNode }) {
  const { history } = useRouter();
  const [draft] = useState(() => createCommunicationDraft(history));
  const [ownLifecycle] = useState(() => (element: HTMLDivElement | null) => {
    if (!element) return;
    draft.activate();
    return () => draft.dispose();
  });
  return (
    <DraftContext.Provider value={draft}>
      <div data-communications-background ref={ownLifecycle} className="contents">
        {children}
      </div>
    </DraftContext.Provider>
  );
}
export function useCommunicationDraft() {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error('CommunicationProvider is required');
  return draft;
}
