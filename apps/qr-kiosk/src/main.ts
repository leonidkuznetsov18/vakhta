import { tenantConfig } from '@vakhta/tenant-client';
import QRCode from 'qrcode';
import { KioskChallengeResponse, TerminalPaired } from '@vakhta/contracts';
import { messages, resolveLocale, LOCALES, type Locale } from '@vakhta/i18n';
import { checkForRelease, releaseIsWaiting } from './self-update';

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
  new URLSearchParams(location.search).get('lang') ??
    storedLocale() ??
    tenantConfig()?.defaultLocale ??
    navigator.language,
);
const t = messages(locale);
document.documentElement.lang = locale;
const displayName = tenantConfig()?.displayName ?? t.admin.productName;
document.title = `${t.kiosk.title} · ${displayName}`;
const API_URL =
  tenantConfig()?.apiUrl ?? import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';
const TOKEN_KEY = 'vakhta.kiosk.deviceToken';

const el = {
  title: byId('title'),
  terminal: byId('terminal'),
  terminalName: byId('terminal-name'),
  terminalSwitch: byId('terminal-switch') as HTMLSelectElement,
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

/**
 * Language buttons with the panel's symbols (Russian is a plain "РУ" badge by the customer's choice).
 * The choice is stored and the page reloads, so every text is redrawn at once.
 */
const LANGUAGE_LABELS: Record<Locale, string> = { uk: '🇺🇦', en: '🇬🇧', ru: 'РУ' };
el.lang.setAttribute('aria-label', t.kiosk.language);
for (const code of LOCALES) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = LANGUAGE_LABELS[code];
  button.setAttribute('aria-label', t.language.names[code]);
  button.title = t.language.names[code];
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

el.title.textContent = displayName;
const logoUrl = tenantConfig()?.logoUrl;
if (logoUrl) {
  const logo = document.createElement('img');
  logo.src = logoUrl;
  logo.alt = '';
  logo.className = 'tenant-logo';
  logo.referrerPolicy = 'no-referrer';
  logo.onerror = () => logo.remove();
  el.title.before(logo);
}
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

/**
 * When the next QR is due, as a wall-clock instant. A background or throttled tab runs its timers
 * rarely (once a minute or less), so a per-second counter would stretch one rotation into many
 * minutes; a deadline is met at the first tick after it passes.
 */
let refreshAt = 0;

function refreshIn(seconds: number): void {
  refreshAt = Date.now() + seconds * 1000;
}

/**
 * Retries back off (5, 10, 20, then every 30 s) with jitter, so many kiosks behind one site
 * connection do not hit the API in lockstep after an outage. 30 s stays well inside the three
 * rotations the panel waits before it calls a terminal offline.
 */
const RETRY_BASE_SECONDS = 5;
const RETRY_MAX_SECONDS = 30;
let failures = 0;

function retryDelaySeconds(): number {
  const delay = Math.min(RETRY_MAX_SECONDS, RETRY_BASE_SECONDS * 2 ** failures);
  return delay * (0.8 + Math.random() * 0.4);
}

/**
 * A tablet can stand at more than one terminal, so it keeps every terminal it has paired: id, name
 * and that terminal's own device token. `?terminal=<id>` in the address says which one is on screen,
 * so a browser bookmark or a kiosk-mode start URL pins a screen to its terminal. A token is never
 * shared between terminals — each is paired on its own with its own code.
 */
interface PairedTerminal {
  readonly id: string;
  readonly name: string;
  readonly token: string;
}

const TERMINALS_KEY = 'vakhta.kiosk.terminals';
const TERMINAL_PARAM = 'terminal';

function readTerminals(): PairedTerminal[] {
  try {
    const raw = localStorage.getItem(TERMINALS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is PairedTerminal =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as PairedTerminal).id === 'string' &&
        typeof (x as PairedTerminal).name === 'string' &&
        typeof (x as PairedTerminal).token === 'string',
    );
  } catch {
    return [];
  }
}

function writeTerminals(list: readonly PairedTerminal[]): void {
  try {
    localStorage.setItem(TERMINALS_KEY, JSON.stringify(list));
  } catch {
    // Private mode or storage disabled: the pairings live until the page reloads.
  }
}

let terminals = readTerminals();

function legacyToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? import.meta.env['VITE_KIOSK_DEVICE_TOKEN'] ?? '';
  } catch {
    return import.meta.env['VITE_KIOSK_DEVICE_TOKEN'] ?? '';
  }
}

function selectedId(): string {
  return new URLSearchParams(location.search).get(TERMINAL_PARAM) ?? '';
}

/** The terminal on screen: the one named in the address, else the first paired one. */
function current(): PairedTerminal | null {
  const wanted = selectedId();
  return terminals.find((x) => x.id === wanted) ?? terminals[0] ?? null;
}

// A tablet paired before this screen existed has one bare token and no id yet; it keeps working and
// gets its name and id from the first challenge, which then files it among the paired terminals.
let deviceToken = current()?.token ?? legacyToken();

function remember(terminal: PairedTerminal, select = true): void {
  terminals = [...terminals.filter((x) => x.id !== terminal.id), terminal].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  writeTerminals(terminals);
  deviceToken = terminal.token;
  if (select) setUrlTerminal(terminal.id);
  renderSwitch();
}

function setUrlTerminal(id: string): void {
  const url = new URL(location.href);
  url.searchParams.set(TERMINAL_PARAM, id);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** The select next to the name: every paired terminal, plus a way to pair one more. */
function renderSwitch(): void {
  const now = current();
  el.terminalSwitch.setAttribute('aria-label', t.kiosk.switchTerminal);
  el.terminalSwitch.replaceChildren();
  for (const terminal of terminals) {
    const option = document.createElement('option');
    option.value = terminal.id;
    option.textContent = terminal.name;
    option.selected = terminal.id === now?.id;
    el.terminalSwitch.append(option);
  }
  const add = document.createElement('option');
  add.value = ADD_TERMINAL;
  add.textContent = t.kiosk.addTerminal;
  el.terminalSwitch.append(add);
  // With nothing paired the pairing form is already on screen; one terminal has nothing to switch to
  // but still offers adding a second.
  el.terminalSwitch.hidden = terminals.length === 0;
}

const ADD_TERMINAL = '__add__';

function forgetToken(): void {
  const now = current();
  if (now) {
    terminals = terminals.filter((x) => x.id !== now.id);
    writeTerminals(terminals);
  }
  deviceToken = '';
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
  renderSwitch();
}

function showProblem(text: string, allowRepair = false): void {
  el.qr.hidden = true;
  el.pair.hidden = true;
  el.offline.textContent = text;
  el.offline.hidden = false;
  el.repair.hidden = !allowRepair;
  refreshIn(retryDelaySeconds());
  failures += 1;
}

function showPairing(error?: string): void {
  el.qr.hidden = true;
  el.offline.hidden = true;
  el.repair.hidden = true;
  el.meta.textContent = '';
  el.terminalName.textContent = '';
  el.pairError.textContent = error ?? '';
  el.pairError.hidden = !error;
  el.pair.hidden = false;
  // Keep the switcher in view while pairing: it is the way back to a terminal already paired.
  el.terminal.classList.add('pairing');
  el.pairCode.focus();
}

/**
 * A pairing code works once, so a pairing link must not outlive its first use: the code leaves the
 * address at once. Otherwise every reload (sleeping tab, restart, power loss) resends the spent code,
 * gets 401 and replaces a working QR with the pairing form.
 */
function takeLinkCode(): string | null {
  const code = new URLSearchParams(location.hash.replace(/^#/, '')).get('pair');
  if (!code) return null;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return code;
}

/**
 * `keepPaired`: a rejected code from a link is expected when a saved start page still carries it;
 * a terminal this browser already holds keeps showing its QR instead of asking for a new code.
 */
let pairing = false;

async function pair(code: string, keepPaired = false): Promise<void> {
  pairing = true;
  el.pairButton.disabled = true;
  el.pairButton.textContent = t.kiosk.pairing;
  try {
    const paired = await requestPairing(code);
    failures = 0;
    if (paired) {
      await showPaired(paired);
      return;
    }
    if (keepPaired && deviceToken) {
      el.pairCode.value = '';
      await fetchChallenge();
      return;
    }
    showPairing(t.kiosk.pairInvalid);
  } catch {
    showPairing(t.kiosk.offline);
    // The link code may be a new terminal's and still valid: retry it rather than dropping it or
    // falling back to another terminal. Only the server's refusal proves it was a spent code.
    if (keepPaired) setTimeout(() => void pair(code, true), retryDelaySeconds() * 1000);
    failures += 1;
  } finally {
    pairing = false;
    el.pairButton.disabled = false;
    el.pairButton.textContent = t.kiosk.pairButton;
  }
}

/** The paired terminal, or null when the server rejects the code; a network failure throws. */
async function requestPairing(code: string): Promise<TerminalPaired | null> {
  const res = await fetch(`${API_URL}/kiosk/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401 || res.status === 400) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return TerminalPaired.parse(await res.json());
}

async function showPaired(paired: TerminalPaired): Promise<void> {
  remember({ id: paired.terminalId, name: paired.terminalName, token: paired.deviceToken });
  el.pair.hidden = true;
  el.pairCode.value = '';
  el.terminalName.textContent = paired.terminalName;
  await fetchChallenge();
}

/** A request on a flaky site network must not hang forever and block the next refresh. */
const REQUEST_TIMEOUT_MS = 15_000;
let loading = false;

async function fetchChallenge(): Promise<void> {
  if (!deviceToken) {
    showPairing();
    return;
  }
  // The terminal can be switched while this request is in flight; only its own answer may draw.
  const token = deviceToken;
  loading = true;
  try {
    const res = await fetch(`${API_URL}/kiosk/challenge`, {
      headers: { 'x-device-token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (token !== deviceToken) return;
    if (res.status === 401 || res.status === 403) {
      showProblem(t.kiosk.unauthorized, true);
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = KioskChallengeResponse.parse(await res.json());
    if (token !== deviceToken) return;
    await showChallenge(data);
    // The server has just answered, so the network is up: the one moment a reload into a new
    // release cannot strand the screen on the browser's offline page.
    if (releaseIsWaiting()) location.reload();
  } catch {
    if (token !== deviceToken) return;
    el.syncDot.className = 'dot bad';
    showProblem(t.kiosk.offline);
  } finally {
    loading = false;
  }
}

async function showChallenge(data: KioskChallengeResponse): Promise<void> {
  el.qr.replaceChildren();
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, data.deepLink, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 560,
  });
  el.qr.append(canvas);

  el.terminalName.textContent = data.terminalName;
  // A tablet paired before the switcher existed arrives with a bare token: file it now that the
  // challenge has told us which terminal it belongs to, and it joins the list like any other.
  if (!terminals.some((x) => x.id === data.terminalId)) {
    remember({ id: data.terminalId, name: data.terminalName, token: deviceToken }, !selectedId());
  }
  lastSync = new Date();
  el.syncDot.className = 'dot ok';
  refreshIn(data.rotationSeconds);
  failures = 0;
  el.offline.hidden = true;
  el.repair.hidden = true;
  el.pair.hidden = true;
  el.qr.hidden = false;
  el.terminal.classList.remove('pairing');
}

/**
 * After sleep or a network drop the QR on screen may already be expired; fetch a fresh one at once
 * instead of waiting for the next tick of a page that was frozen or hidden.
 */
function refreshNow(): void {
  if (!el.pair.hidden || loading || pairing) return;
  void fetchChallenge();
}

/** Switching terminals: change the address, use that terminal's token, redraw the QR. */
/**
 * A select keeps focus after a mouse picks from it, and `:focus-within` would hold the switcher
 * open long after the pointer has gone. So a pointer-driven choice gives the focus back and the
 * title returns; a keyboard one keeps it, because that is where the person still is.
 */
let viaPointer = false;
el.terminalSwitch.addEventListener('pointerdown', () => {
  viaPointer = true;
});
el.terminalSwitch.addEventListener('keydown', () => {
  viaPointer = false;
});

function releaseSwitch(): void {
  el.terminal.classList.remove('open');
  if (viaPointer && document.activeElement === el.terminalSwitch) el.terminalSwitch.blur();
}

el.terminalSwitch.addEventListener('change', () => {
  const value = el.terminalSwitch.value;
  if (value === ADD_TERMINAL) {
    renderSwitch();
    showPairing();
    return;
  }
  const chosen = terminals.find((x) => x.id === value);
  if (!chosen) return;
  deviceToken = chosen.token;
  setUrlTerminal(chosen.id);
  el.terminalName.textContent = chosen.name;
  releaseSwitch();
  void fetchChallenge();
});

// On a touch screen there is no hover, so a tap on the name opens the list; the pointer leaving
// closes it again, whether the choice was made or abandoned.
el.terminal.addEventListener('click', () => el.terminal.classList.add('open'));
el.terminal.addEventListener('mouseleave', releaseSwitch);

/** A deadline further ahead than any rotation means the device clock was set back: it is due. */
const MAX_AHEAD_MS = 5 * 60_000;

function tick(): void {
  drawClock();
  if (!el.pair.hidden || pairing) return;
  if (refreshAt - Date.now() > MAX_AHEAD_MS) refreshAt = 0;
  const left = Math.max(0, Math.ceil((refreshAt - Date.now()) / 1000));
  el.meta.textContent = `${t.kiosk.refreshIn} ${left} ${t.kiosk.seconds}`;
  if (left === 0 && !loading) void fetchChallenge();
  void checkForRelease();
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
  if (document.visibilityState !== 'visible') return;
  void keepAwake();
  refreshNow();
});
// A frozen page gets `resume`, one restored from the back/forward cache `pageshow`; both can
// still hold an expired QR.
window.addEventListener('online', refreshNow);
window.addEventListener('pageshow', refreshNow);
document.addEventListener('resume', refreshNow);
drawClock();
void keepAwake();
// The device token lives in this origin's storage; ask the browser not to evict it under storage
// pressure. Best effort: a refusal changes nothing.
if ('storage' in navigator) void navigator.storage.persist().catch(() => false);
el.repair.addEventListener('click', () => {
  forgetToken();
  showPairing();
});

renderSwitch();
const chosen = current();
if (chosen) el.terminalName.textContent = chosen.name;

const codeFromLink = takeLinkCode();
if (codeFromLink) {
  el.pairCode.value = codeFromLink;
  void pair(codeFromLink, true);
} else {
  void fetchChallenge();
}
setInterval(tick, 1000);

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Element #${id} not found`);
  return node;
}
