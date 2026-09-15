import {
  loadQuestionnaireBridge,
  questionnaireEntry,
  QuestionnaireResponse,
} from '@/features/questionnaire-response';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { App, createPanelRouter } from './app/index';
import { redirectToCanonicalOrigin } from './canonical.ts';
import { currentLocale } from './i18n.tsx';
import { queryClient } from '@/lib/query';
import { applyStoredAppearance } from '@/lib/theme';
import { installZodLocale } from '@/lib/validation';
import './index.css';

const router = createPanelRouter();

installZodLocale();
applyStoredAppearance();

if (redirectToCanonicalOrigin()) throw new Error('Redirecting to the canonical origin');

document.documentElement.lang = currentLocale();

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

const entry = questionnaireEntry(location);
async function bootstrap(root: HTMLElement) {
  let questionnaireLaunch = '';
  if (entry.kind === 'questionnaire' && entry.id) {
    try {
      questionnaireLaunch = await loadQuestionnaireBridge();
    } catch {
      questionnaireLaunch = '';
    }
  }
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {entry.kind === 'questionnaire' ? (
            <QuestionnaireResponse id={entry.id} launch={questionnaireLaunch} />
          ) : (
            <App router={router} />
          )}
          <Toaster richColors position="bottom-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void bootstrap(root);
