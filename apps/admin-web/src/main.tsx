import { messages, resolveLocale } from '@vakhta/i18n';
import { TenantSurface } from '@vakhta/domain';
import {
  applyTenantBranding,
  browserStorage,
  resolveTenant,
  setTenantConfig,
} from '@vakhta/tenant-client';
import './index.css';

const configuredControlUrl: unknown = import.meta.env['VITE_CONTROL_API_URL'];
const controlUrl =
  typeof configuredControlUrl === 'string' && configuredControlUrl
    ? configuredControlUrl
    : 'https://control-api.vakhta.xyz';

async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    await import('./render');
    return;
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('#root element not found');
  const t = messages(resolveLocale(navigator.language)).onboarding;
  root.textContent = t.loading;
  root.setAttribute('role', 'status');
  try {
    const config = await resolveTenant({
      host: location.host,
      surface: TenantSurface.PANEL,
      controlUrl,
      storage: browserStorage(),
    });
    if (location.origin !== new URL(config.canonicalUrl).origin) {
      location.replace(
        `${config.canonicalUrl}${location.pathname}${location.search}${location.hash}`,
      );
      return;
    }
    setTenantConfig(config);
    applyTenantBranding(config, document);
    root.removeAttribute('role');
    await import('./render');
  } catch {
    root.replaceChildren();
    root.className = 'mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6';
    const message = document.createElement('p');
    message.textContent = t.unavailable;
    const retry = document.createElement('button');
    retry.textContent = t.retry;
    retry.className = 'rounded-md border px-4 py-2 hover:bg-muted focus-visible:ring-2';
    retry.onclick = () => location.reload();
    root.append(message, retry);
    root.setAttribute('role', 'alert');
  }
}
void start();
