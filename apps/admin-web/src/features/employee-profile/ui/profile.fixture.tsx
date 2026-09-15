import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EmployeeProfileView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { SectionEditor } from './section-editor';
import fixture from '../model/__fixtures__/profile.json';
import '@/index.css';

// This dedicated test entry is not included in the production build.
if (!import.meta.env.DEV) throw new Error('Profile fixture is development-only');
localStorage.setItem('vakhta.locale', 'en');
const profile = EmployeeProfileView.parse(fixture);
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Fixture() {
  const [complete, setComplete] = useState(false);
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-3xl p-4">
        <h1 className="mb-4 text-xl font-semibold">{profile.employee.fullName}</h1>
        {complete ? (
          <output>{messages('en').ui.common.save}</output>
        ) : (
          <SectionEditor profile={profile} section="all" onClose={() => setComplete(true)} />
        )}
      </main>
    </QueryClientProvider>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Fixture />);
