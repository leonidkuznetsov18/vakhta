import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { App } from './App.tsx';
import { redirectToCanonicalOrigin } from './canonical.ts';
import { currentLocale } from './i18n.tsx';
import './index.css';

if (redirectToCanonicalOrigin()) throw new Error('Redirecting to the canonical origin');

document.documentElement.lang = currentLocale();

const root = document.getElementById('root');
if (!root) throw new Error('#root element not found');

createRoot(root).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
      <Toaster richColors position="top-right" closeButton />
    </TooltipProvider>
  </StrictMode>,
);
