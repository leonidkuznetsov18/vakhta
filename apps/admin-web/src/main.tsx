import { loadQuestionnaireBridge, QuestionnaireResponse } from '@/features/questionnaire-response';
import { Uuid } from '@vakhta/contracts';
import { restoreLegacyRoute } from '@/lib/route';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { App } from './App.tsx';
import { redirectToCanonicalOrigin } from './canonical.ts';
import { currentLocale } from './i18n.tsx';
import { queryClient } from '@/lib/query';
import { applyStoredAppearance } from '@/lib/theme';
import { installZodLocale } from '@/lib/validation';
import './index.css';

installZodLocale();
applyStoredAppearance();

if (redirectToCanonicalOrigin()) throw new Error('Redirecting to the canonical origin');

document.documentElement.lang = currentLocale();

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

const questionnaireParameter = new URLSearchParams(location.search).get('questionnaire');
const questionnaireId = Uuid.safeParse(questionnaireParameter);
async function bootstrap(root: HTMLElement) {
  let questionnaireLaunch = '';
  if (questionnaireId.success) {
    try {
      questionnaireLaunch = await loadQuestionnaireBridge();
    } catch {
      questionnaireLaunch = '';
    }
  } else {
    restoreLegacyRoute();
  }
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {questionnaireId.success ? (
            <QuestionnaireResponse id={questionnaireId.data} launch={questionnaireLaunch} />
          ) : (
            <App />
          )}
          <Toaster richColors position="bottom-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void bootstrap(root);
