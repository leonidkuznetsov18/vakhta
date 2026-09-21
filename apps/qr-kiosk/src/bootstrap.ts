import { messages, resolveLocale } from '@vakhta/i18n';
import { browserStorage, resolveTenant, setTenantConfig } from '@vakhta/tenant-client';

const configuredControlUrl: unknown = import.meta.env['VITE_CONTROL_API_URL'];
const controlUrl =
  typeof configuredControlUrl === 'string' && configuredControlUrl.length > 0
    ? configuredControlUrl
    : 'https://control-api.vakhta.xyz';

async function start(): Promise<void> {
  if (import.meta.env.DEV) {
    await import('./main');
    return;
  }
  const t = messages(resolveLocale(navigator.language)).onboarding;
  const surface = document.createElement('main');
  surface.setAttribute('role', 'status');
  surface.textContent = t.loading;
  document.body.prepend(surface);
  const elements = [...document.body.children].filter(
    (element): element is HTMLElement => element !== surface && element instanceof HTMLElement,
  );
  for (const element of elements) element.hidden = true;
  try {
    const config = await resolveTenant({
      host: location.host,
      surface: 'KIOSK',
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
    surface.remove();
    for (const element of elements) element.hidden = false;
    await import('./main');
  } catch {
    document.body.prepend(surface);
    surface.setAttribute('role', 'alert');
    surface.textContent = t.unavailable;
    const retry = document.createElement('button');
    retry.textContent = t.retry;
    retry.onclick = () => location.reload();
    surface.append(retry);
  }
}
void start();
