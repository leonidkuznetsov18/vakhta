import React, { useState } from 'react';
import { messages } from '@vakhta/i18n';
import { LoginScreen } from './auth/LoginScreen.tsx';
import { ProfilePanel } from './auth/ProfilePanel.tsx';
import { useSession } from './auth/useSession.ts';

const t = messages('ru');

type SectionKey = keyof typeof t.admin.sections | 'profile';
const SECTION_KEYS = Object.keys(t.admin.sections) as (keyof typeof t.admin.sections)[];

/**
 * Панель: дев'ять розділів ТЗ 9.1 за сесією better-auth. Розділи наповнюються
 * по фазах плану; профіль дозволяє ввімкнути TOTP.
 */
export function App() {
  const { state, refresh, signOut } = useSession();
  const [active, setActive] = useState<SectionKey>('operations');

  if (state.status === 'loading') {
    return <main className="login" aria-busy="true" />;
  }
  if (state.status === 'anonymous') {
    return <LoginScreen offline={state.offline} onSignedIn={() => void refresh()} />;
  }

  const { me } = state;
  const title = active === 'profile' ? t.admin.auth.profile : t.admin.sections[active];

  return (
    <div className="shell">
      <aside className="nav" aria-label="Разделы">
        <div className="brand">{t.admin.productName}</div>
        <nav>
          {SECTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={key === active ? 'nav-item active' : 'nav-item'}
              aria-current={key === active ? 'page' : undefined}
              onClick={() => setActive(key)}
            >
              {t.admin.sections[key]}
            </button>
          ))}
        </nav>
        <div className="status">
          <button
            type="button"
            className={active === 'profile' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActive('profile')}
          >
            {me.email}
          </button>
          <button type="button" className="nav-item" onClick={() => void signOut()}>
            {t.admin.auth.signOut}
          </button>
        </div>
      </aside>
      <main className="content">
        <h1>{title}</h1>
        {active === 'profile' ? (
          <ProfilePanel me={me} onChanged={() => void refresh()} />
        ) : (
          <p className="muted">{t.admin.placeholder}</p>
        )}
      </main>
    </div>
  );
}
