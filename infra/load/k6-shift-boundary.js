// k6 run infra/load/k6-shift-boundary.js
// Пік межі зміни (ТЗ 16 «нагрузочные числа», NFR-01): одночасні запити 15 хвилин до і після 08:00/20:00.
// Сценарій б'є лише публічні або сесійні HTTP-поверхні; кнопки бота моделює apps/api/src/load/shift-boundary.load.test.ts.
//
// Змінні: BASE_URL (http://localhost:3000), KIOSK_TOKEN (x-device-token терміналу),
// ADMIN_COOKIE (cookie сесії панелі, необовʼязково), EMPLOYEES (кількість віртуальних працівників, типово 100).
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const KIOSK = __ENV.KIOSK_TOKEN || '';
const COOKIE = __ENV.ADMIN_COOKIE || '';
const EMPLOYEES = Number(__ENV.EMPLOYEES || 100);

const kioskLatency = new Trend('kiosk_challenge_ms', true);
const adminLatency = new Trend('admin_list_ms', true);

export const options = {
  scenarios: {
    // Термінал QR: кожен кіоск опитує challenge раз на 45 с; на межі зміни працівники сканують масово.
    kiosk: {
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages: [
        { duration: '2m', target: 5 },
        { duration: '3m', target: Math.ceil(EMPLOYEES / 15) },
        { duration: '2m', target: 5 },
      ],
    },
    // Панель: оперативний екран майстра оновлюється кожні 5 с (FR-WEB-01) кількома вкладками.
    panel: { executor: 'constant-vus', vus: 5, duration: '7m', exec: 'panel' },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    kiosk_challenge_ms: ['p(95)<500'],
    admin_list_ms: ['p(95)<2000'], // NFR: p95 ≤ 2 с для дій панелі
  },
};

export default function kiosk() {
  const res = http.get(`${BASE}/kiosk/challenge`, { headers: { 'x-device-token': KIOSK } });
  kioskLatency.add(res.timings.duration);
  check(res, { 'challenge 200': (r) => r.status === 200 || (KIOSK === '' && r.status === 401) });
  const health = http.get(`${BASE}/health`);
  check(health, { 'health ok': (r) => r.status === 200 });
  sleep(1);
}

export function panel() {
  if (!COOKIE) {
    sleep(5);
    return;
  }
  const headers = { cookie: COOKIE };
  const shifts = http.get(`${BASE}/admin/shifts`, { headers });
  adminLatency.add(shifts.timings.duration);
  check(shifts, { 'shifts 200': (r) => r.status === 200 });
  const incidents = http.get(`${BASE}/admin/incidents`, { headers });
  adminLatency.add(incidents.timings.duration);
  sleep(5);
}
