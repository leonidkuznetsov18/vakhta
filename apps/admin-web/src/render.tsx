import { WelcomePage } from '@/pages/welcome';
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
import { currentLocale } from './i18n.tsx';
import { queryClient } from '@/lib/query';
import { applyStoredAppearance } from '@/lib/theme';
import { installZodLocale } from '@/lib/validation';
import './index.css';

const router = createPanelRouter();

installZodLocale();
applyStoredAppearance();

document.documentElement.lang = currentLocale();

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

const entry = questionnaireEntry(location);
const welcomeToken = /^#\/welcome\/([A-Za-z0-9_-]+)$/.exec(location.hash)?.[1];
async function bootstrap(root: HTMLElement) {
  let questionnaireLaunch = '';
  if (entry.kind === 'questionnaire' && entry.id) {
    try {
      questionnaireLaunch = await loadQuestionnaireBridge();
    } catch {
      questionnaireLaunch = '';
    }
  }
  let content = <App router={router} />;
  if (entry.kind === 'questionnaire')
    content = <QuestionnaireResponse id={entry.id} launch={questionnaireLaunch} />;
  if (welcomeToken) content = <WelcomePage token={welcomeToken} />;
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          {content}
          <Toaster richColors position="bottom-right" closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
void bootstrap(root);
