import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { applyStoredAppearance } from '@/lib/theme';
import { installZodLocale } from '@/lib/validation';
import './index.css';

/**
 * Visual preview of the signed-in shell without an API: `fetch` answers with fixtures, so the
 * sidebar, the header and the pages can be screenshotted in a browser during development
 * (`pnpm --filter admin-web dev` → http://localhost:5173/preview.html). Not part of the build.
 */
const me: { [k: string]: unknown; image: string | null } = {
  id: 'u-preview',
  email: 'admin@example.com',
  name: 'Леонид Кузнецов',
  twoFactorEnabled: true,
  image: null,
  roles: [
    {
      id: 'g1',
      role: 'ADMIN',
      scopeType: 'ENTERPRISE',
      scopeId: null,
      grantedAt: '2026-09-01T00:00:00Z',
    },
  ],
  createdAt: '2026-09-01T00:00:00Z',
};
const attention = {
  onShift: 3,
  inDowntime: 1,
  openIncidents: 2,
  slaBreached: 0,
  disputes: 1,
  overdueAcceptances: 0,
  requestsForMe: 4,
  overdueRequests: 0,
  overtimePending: 2,
  unlinkedEmployees: 12,
  unpairedTerminals: 0,
  refreshedAt: new Date().toISOString(),
};
const org = {
  sites: [{ id: 's1', code: 'main', name: 'Основная площадка', timezone: 'Europe/Kyiv' }],
  orgUnits: [{ id: 'u1', siteId: 's1', parentId: null, name: 'Цех Крышки' }],
  teams: [],
  positions: [{ id: 'p1', code: 'OPERATOR', name: 'Оператор' }],
  zones: [],
  terminals: [],
  reasonCodes: [],
  shiftTemplates: [],
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
window.fetch = async (input: RequestInfo | URL) => {
  const path = new URL(String(input), location.origin).pathname;
  if (path === '/me') return json(me);
  if (path.includes('attention')) return json(attention);
  if (path === '/admin/org') return json(org);
  return json([]);
};
const params = new URLSearchParams(location.search);
// `?avatar=1` gives the fixture user a photo (a 1×1 PNG stretched by the browser is enough for layout).
if (params.get('avatar') === '1') {
  me.image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}
try {
  localStorage.setItem('vakhta.locale', params.get('lang') ?? 'uk');
  localStorage.setItem('vakhta.ui.theme', JSON.stringify(params.get('theme') ?? 'light'));
} catch {
  // preview only
}
installZodLocale();
applyStoredAppearance();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider delayDuration={200}>
      <App />
      <Toaster richColors position="bottom-right" closeButton />
    </TooltipProvider>
  </StrictMode>,
);
// `?collapsed=1` shows the icon rail: press the sidebar trigger once the shell has mounted.
if (params.get('collapsed') === '1') {
  const collapse = () => {
    const trigger = document.querySelector<HTMLButtonElement>('[data-sidebar="trigger"]');
    if (trigger) trigger.click();
    else setTimeout(collapse, 100);
  };
  setTimeout(collapse, 300);
}
