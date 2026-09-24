import { messages, resolveLocale } from '@vakhta/i18n';
import {
  applyTenantBranding,
  browserStorage,
  resolveTenant,
  setTenantConfig,
} from '@vakhta/tenant-client';

const configuredControlUrl: unknown = import.meta.env['VITE_CONTROL_API_URL'];
const controlUrl =
  typeof configuredControlUrl === 'string' && configuredControlUrl.length > 0
    ? configuredControlUrl
    : 'https://control-api.vakhta.xyz';

/**
 * Nobody stands at an unattended kiosk to press "retry": a control-api restart or a site network
 * drop must heal by itself. The retry stays inside the page; a reload while offline would leave the
 * browser's own error page, where no script runs to try again.
 */
const AUTO_RETRY_MS = 30_000;

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

  const attempt = async (): Promise<void> => {
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
      applyTenantBranding(config, document);
      surface.remove();
      for (const element of elements) element.hidden = false;
      await import('./main');
    } catch {
      showUnavailable(surface, t, attempt);
    }
  };
  await attempt();
}

function showUnavailable(
  surface: HTMLElement,
  t: ReturnType<typeof messages>['onboarding'],
  attempt: () => Promise<void>,
): void {
  document.body.prepend(surface);
  surface.setAttribute('role', 'alert');
  surface.textContent = t.unavailable;
  const retry = document.createElement('button');
  retry.textContent = t.retry;
  const timer = setTimeout(() => void attempt(), AUTO_RETRY_MS);
  retry.onclick = () => {
    clearTimeout(timer);
    surface.textContent = t.loading;
    void attempt();
  };
  surface.append(retry);
}
void start();
