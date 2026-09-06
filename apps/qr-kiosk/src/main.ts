import QRCode from 'qrcode';
import { KioskChallengeResponse, TerminalPaired } from '@vakhta/contracts';
import { messages, resolveLocale, LOCALES, type Locale } from '@vakhta/i18n';

// The `pages.dev` host is a deployment artifact: land on the custom domain the API trusts.
const CANONICAL_ORIGIN = import.meta.env['VITE_CANONICAL_ORIGIN'];
if (CANONICAL_ORIGIN && location.origin !== CANONICAL_ORIGIN) {
  location.replace(`${CANONICAL_ORIGIN}${location.pathname}${location.search}${location.hash}`);
}

/**
 * The terminal shows a QR with a deep link to the bot and refreshes it every rotationSeconds (FR-QR-01).
 * The challenge token itself never lives here longer than it is on screen.
 *
 * Pairing: the tablet has no device token until someone types the one-time code from the panel
 * (or opens the link that carries it). The token then stays in this browser's storage; nobody
 * copies secrets into environment variables. `VITE_KIOSK_DEVICE_TOKEN` remains a local-dev shortcut.
 *
 * Language: `?lang=uk|en|ru` in the kiosk URL, otherwise the choice made with the buttons in the
 * corner (kept in this browser), otherwise the browser language, otherwise the default.
 */
const LOCALE_KEY = 'vakhta.kiosk.locale';
function storedLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}
const locale = resolveLocale(
  new URLSearchParams(location.search).get('lang') ?? storedLocale() ?? navigator.language,
);
const t = messages(locale);
document.documentElement.lang = locale;
document.title = `${t.admin.productName} · ${t.kiosk.title}`;
const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';
const TOKEN_KEY = 'vakhta.kiosk.deviceToken';

const el = {
  title: byId('title'),
  terminal: byId('terminal'),
  qr: byId('qr'),
  hint: byId('hint'),
  meta: byId('meta'),
  offline: byId('offline'),
  repair: byId('repair') as HTMLButtonElement,
  pair: byId('pair') as HTMLFormElement,
  pairTitle: byId('pair-title'),
  pairHint: byId('pair-hint'),
  pairLabel: byId('pair-label'),
  pairCode: byId('pair-code') as HTMLInputElement,
  pairButton: byId('pair-button') as HTMLButtonElement,
  pairError: byId('pair-error'),
  time: byId('time'),
  date: byId('date'),
  sync: byId('sync'),
  syncDot: byId('sync-dot'),
  fullscreen: byId('fullscreen') as HTMLButtonElement,
  lang: byId('lang'),
};

/** Language buttons: the choice is stored and the page reloads, so every text is redrawn at once. */
const LANGUAGE_LABELS: Record<Locale, string> = { uk: 'UA', en: 'EN', ru: 'РУ' };
el.lang.setAttribute('aria-label', t.kiosk.language);
for (const code of LOCALES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = LANGUAGE_LABELS[code];
  button.lang = code;
  button.className = code === locale ? 'lang-button active' : 'lang-button';
  button.setAttribute('aria-pressed', String(code === locale));
  button.addEventListener('click', () => {
    if (code === locale) return;
    try {
      localStorage.setItem(LOCALE_KEY, code);
    } catch {
      // Storage unavailable: the URL parameter still carries the choice.
    }
    const url = new URL(location.href);
    url.searchParams.set('lang', code);
    location.replace(url.toString());
  });
  el.lang.appendChild(button);
}

el.title.textContent = t.kiosk.title;
el.hint.textContent = t.kiosk.hint;
el.pairTitle.textContent = t.kiosk.pairTitle;
el.pairHint.textContent = t.kiosk.pairHint;
el.pairLabel.textContent = t.kiosk.pairCode;
el.pairButton.textContent = t.kiosk.pairButton;
el.repair.textContent = t.kiosk.repair;
el.fullscreen.textContent = t.kiosk.fullscreen;

const INTL: Record<string, string> = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' };
let lastSync: Date | null = null;

/** Clock and date in the header so the tablet doubles as the wall clock of the checkpoint. */
function drawClock(): void {
  const now = new Date();
  const tag = INTL[locale] ?? 'ru-RU';
  el.time.textContent = now.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
  el.date.textContent = now.toLocaleDateString(tag, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
  el.sync.textContent = lastSync
    ? `${t.kiosk.lastSync} ${lastSync.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' })}`
    : t.kiosk.lastSync;
}

/** Keeps the screen on while the kiosk is shown; browsers without the API just ignore it. */
async function keepAwake(): Promise<void> {
  try {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<unknown> };
    };
    await nav.wakeLock?.request('screen');
  } catch {
    // Denied or unsupported: nothing to do.
  }
}

let countdown = 0;
let deviceToken = readToken();

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? import.meta.env['VITE_KIOSK_DEVICE_TOKEN'] ?? '';
  } catch {
    return import.meta.env['VITE_KIOSK_DEVICE_TOKEN'] ?? '';
  }
}

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Private mode or storage disabled: the token lives until the page reloads.
  }
}

function forgetToken(): void {
  deviceToken = '';
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

function showProblem(text: string, allowRepair = false): void {
  el.qr.hidden = true;
  el.pair.hidden = true;
  el.offline.textContent = text;
  el.offline.hidden = false;
  el.repair.hidden = !allowRepair;
  countdown = 10;
}

function showPairing(error?: string): void {
  el.qr.hidden = true;
  el.offline.hidden = true;
  el.repair.hidden = true;
  el.meta.textContent = '';
  el.terminal.textContent = '';
  el.pairError.textContent = error ?? '';
  el.pairError.hidden = !error;
  el.pair.hidden = false;
  el.pairCode.focus();
}

async function pair(code: string): Promise<void> {
  el.pairButton.disabled = true;
  el.pairButton.textContent = t.kiosk.pairing;
  try {
    const res = await fetch(`${API_URL}/kiosk/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.status === 401 || res.status === 400) {
      showPairing(t.kiosk.pairInvalid);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const paired = TerminalPaired.parse(await res.json());
    deviceToken = paired.deviceToken;
    storeToken(deviceToken);
    el.pair.hidden = true;
    el.pairCode.value = '';
    el.terminal.textContent = paired.terminalName;
    // Drop the code from the address bar so a reload does not retry it.
    history.replaceState(null, '', location.pathname + location.search);
    await fetchChallenge();
  } catch {
    showPairing(t.kiosk.offline);
  } finally {
    el.pairButton.disabled = false;
    el.pairButton.textContent = t.kiosk.pairButton;
  }
}

async function fetchChallenge(): Promise<void> {
  if (!deviceToken) {
    showPairing();
    return;
  }
  try {
    const res = await fetch(`${API_URL}/kiosk/challenge`, {
      headers: { 'x-device-token': deviceToken },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      showProblem(t.kiosk.unauthorized, true);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = KioskChallengeResponse.parse(await res.json());

    el.qr.replaceChildren();
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, data.deepLink, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 560,
    });
    el.qr.append(canvas);

    el.terminal.textContent = data.terminalName;
    lastSync = new Date();
    el.syncDot.className = 'dot ok';
    countdown = data.rotationSeconds;
    el.offline.hidden = true;
    el.repair.hidden = true;
    el.pair.hidden = true;
    el.qr.hidden = false;
  } catch {
    el.syncDot.className = 'dot bad';
    showProblem(t.kiosk.offline);
  }
}

function tick(): void {
  drawClock();
  if (!el.pair.hidden) return;
  countdown -= 1;
  el.meta.textContent = `${t.kiosk.refreshIn} ${Math.max(0, countdown)} ${t.kiosk.seconds}`;
  if (countdown <= 0) void fetchChallenge();
}

el.pair.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const code = el.pairCode.value.trim();
  if (code.length >= 8) void pair(code);
});
el.fullscreen.addEventListener('click', () => {
  void document.documentElement.requestFullscreen?.().catch(() => undefined);
  void keepAwake();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void keepAwake();
});
drawClock();
void keepAwake();
el.repair.addEventListener('click', () => {
  forgetToken();
  showPairing();
});

const codeFromLink = new URLSearchParams(location.hash.replace(/^#/, '')).get('pair');
if (codeFromLink) {
  el.pairCode.value = codeFromLink;
  void pair(codeFromLink);
} else {
  void fetchChallenge();
}
setInterval(tick, 1000);

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} not found`);
  return node;
}
