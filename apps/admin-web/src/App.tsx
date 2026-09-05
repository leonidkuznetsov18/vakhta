import React, { useEffect, useState } from 'react';
import { messages } from '@vakhta/i18n';

const t = messages('ru');

type SectionKey = keyof typeof t.admin.sections;
const SECTION_KEYS = Object.keys(t.admin.sections) as SectionKey[];

interface Health {
  status: string;
  serverTime: string;
}

const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';

/**
 * Скелет панелі: дев'ять розділів ТЗ 9.1 і перевірка зв'язку з API.
 * Маршрутизація, авторизація і дані з'являються у фазі 1 (документ 4.2).
 */
export function App() {
  const [active, setActive] = useState<SectionKey>('operations');
  const [health, setHealth] = useState<Health | 'offline' | 'loading'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/health`, { signal: controller.signal })
      .then((r) =>
        r.ok ? (r.json() as Promise<Health>) : Promise.reject(new Error(String(r.status))),
      )
      .then(setHealth)
      .catch(() => setHealth('offline'));
    return () => controller.abort();
  }, []);

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
        <div className="status" role="status">
          {health === 'loading' && 'API: проверка…'}
          {health === 'offline' && <span className="bad">API недоступен</span>}
          {typeof health === 'object' && (
            <span className="ok">
              API online · {new Date(health.serverTime).toLocaleTimeString('ru-RU')}
            </span>
          )}
        </div>
      </aside>
      <main className="content">
        <h1>{t.admin.sections[active]}</h1>
        <p className="muted">{t.admin.placeholder}</p>
      </main>
    </div>
  );
}
