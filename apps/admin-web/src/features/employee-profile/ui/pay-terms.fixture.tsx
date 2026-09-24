import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PencilIcon } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/app/avatar';
import { Toaster } from '@/components/ui/sonner';
import { notifySuccess } from '@/lib/toast';
import { TermMode } from './pay-terms/model';
import {
  PayTermsSection,
  type PayTermsAccess,
  type PayTermsDemo,
} from './pay-terms/pay-terms-section';
import { MONTH, MONTH_KEY, PLANNED_HOURS, payTerms } from './pay-terms/fixture-data';
import '@/index.css';

// Prototype entry for the card section «Должности и оплата» (spec 015); never in the production build.
if (!import.meta.env.DEV) throw new Error('Pay terms fixture is development-only');
localStorage.setItem('vakhta.locale', 'ru');

const TODAY = '2026-09-24';

interface Scenario {
  readonly demo: PayTermsDemo;
  readonly access: PayTermsAccess;
}

const SCENARIOS: Record<string, Scenario> = {
  read: { demo: {}, access: 'WRITE' },
  path: { demo: { pathFor: 'BASE_SALARY' }, access: 'WRITE' },
  replace: { demo: { editor: { key: 'BASE_SALARY', mode: TermMode.REPLACE } }, access: 'WRITE' },
  add: { demo: { editor: { key: 'LEAD_SUPPLEMENT', mode: TermMode.ADD } }, access: 'WRITE' },
  level: { demo: { level: true }, access: 'WRITE' },
  adjustment: { demo: { adjustment: true }, access: 'WRITE' },
  transfer: { demo: { transfer: true }, access: 'WRITE' },
  history: { demo: { historyOpen: true }, access: 'WRITE' },
  accountant: { demo: {}, access: 'READ' },
  'names-only': { demo: {}, access: 'NAMES' },
};

const TRANSFER_TARGETS = [
  {
    id: 't1',
    path: ['Производство', 'Цех Плёнка'],
    groupName: 'ЗП наладчика v3',
    groupBase: 40000,
  },
  {
    id: 't2',
    path: ['Производство', 'Цех Крышки', 'Линия 2'],
    groupName: 'ЗП наладчика v3',
    groupBase: 40000,
  },
  {
    id: 't3',
    path: ['Сервис и логистика', 'Ремонтная служба'],
    groupName: 'ЗП электрика v1',
    groupBase: 38000,
  },
];

/** A static stand-in for the card header, so the section is seen where it lives. */
function CardHeader() {
  return (
    <header className="flex flex-wrap items-start gap-4 border-b pb-4">
      <UserAvatar name="Марченко Наталія" email="e-1010" image={null} className="size-14 text-lg" />
      <div className="min-w-0 flex-1 basis-52 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">Марченко Наталія</h1>
          <Button variant="outline" size="sm">
            <PencilIcon aria-hidden="true" />
            Редактировать
          </Button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>№ 1010</span>
          <span>Активен</span>
          <span>Telegram подключён</span>
          <span>Наладчик · Линия 1</span>
          <span>Руководитель: Сидоренко Дмитро</span>
        </div>
      </div>
    </header>
  );
}

const client = new QueryClient();
const state = new URLSearchParams(location.search).get('state') ?? 'read';
const current = SCENARIOS[state] ?? SCENARIOS['read'];
const root = document.getElementById('root');
if (!root || !current) throw new Error('Missing fixture root');
createRoot(root).render(
  <QueryClientProvider client={client}>
    <TooltipProvider delayDuration={200}>
      <main className="mx-auto flex max-w-5xl flex-col gap-4 p-3 md:p-5">
        <CardHeader />
        <PayTermsSection
          terms={payTerms}
          access={current.access}
          month={MONTH}
          monthKey={MONTH_KEY}
          plannedHours={PLANNED_HOURS}
          today={TODAY}
          transferTargets={TRANSFER_TARGETS}
          demo={current.demo}
          onNotify={notifySuccess}
        />
      </main>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>,
);
