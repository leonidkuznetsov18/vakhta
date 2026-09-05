import QRCode from 'qrcode';
import { KioskChallengeResponse } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';

/**
 * Термінал показує QR із deep link на бота і оновлює його кожні rotationSeconds (FR-QR-01).
 * Сам токен ніколи не зберігається тут довше, ніж живе на екрані.
 */
const t = messages('ru');
const API_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000';
const DEVICE_TOKEN = import.meta.env['VITE_KIOSK_DEVICE_TOKEN'] ?? '';

const el = {
  title: byId('title'),
  terminal: byId('terminal'),
  qr: byId('qr'),
  hint: byId('hint'),
  meta: byId('meta'),
  offline: byId('offline'),
};

el.title.textContent = t.kiosk.title;
el.hint.textContent = t.kiosk.hint;

let countdown = 0;

function showProblem(text: string): void {
  el.qr.hidden = true;
  el.offline.textContent = text;
  el.offline.hidden = false;
  countdown = 10;
}

async function fetchChallenge(): Promise<void> {
  if (!DEVICE_TOKEN) {
    showProblem(t.kiosk.notConfigured);
    return;
  }
  try {
    const res = await fetch(`${API_URL}/kiosk/challenge`, {
      headers: { 'x-device-token': DEVICE_TOKEN },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      showProblem(t.kiosk.unauthorized);
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
    countdown = data.rotationSeconds;
    el.offline.hidden = true;
    el.qr.hidden = false;
  } catch {
    showProblem(t.kiosk.offline);
  }
}

function tick(): void {
  countdown -= 1;
  el.meta.textContent = `${t.kiosk.refreshIn} ${Math.max(0, countdown)} ${t.kiosk.seconds}`;
  if (countdown <= 0) void fetchChallenge();
}

void fetchChallenge();
setInterval(tick, 1000);

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Немає елемента #${id}`);
  return node;
}
