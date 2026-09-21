/**
 * Довідники для локальної розробки і пілоту (ТЗ 18 п. 3, 6, 9; FR-DWN-01).
 * Ідемпотентний: повторний запуск нічого не дублює. Запуск: pnpm db:seed
 */
import { and, eq } from 'drizzle-orm';
import { hashDeviceToken } from '@vakhta/domain/node';
import { createDatabase } from './client.js';
import { seedTenantDefaults } from './seed-defaults.js';
import { orgUnits, qrTerminals, responsibilityZones, teams } from './schema/index.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL не задано');
const TIMEZONE = process.env['DEFAULT_SITE_TIMEZONE'] ?? 'Europe/Kyiv';
const KIOSK_DEVICE_TOKEN = process.env['KIOSK_DEVICE_TOKEN'];

const { db, client } = createDatabase(DATABASE_URL, { max: 2 });

/** FR-DWN-01: причини простою. Тексти російською (NFR-08). */

async function ensureOrgUnit(siteId: string, name: string) {
  const [existing] = await db
    .select()
    .from(orgUnits)
    .where(and(eq(orgUnits.siteId, siteId), eq(orgUnits.name, name)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(orgUnits).values({ siteId, name }).returning();
  return row!;
}

async function ensureTeam(orgUnitId: string, name: string) {
  const [existing] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.orgUnitId, orgUnitId), eq(teams.name, name)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db.insert(teams).values({ orgUnitId, name }).returning();
  return row!;
}

async function ensureZone(input: {
  siteId: string;
  orgUnitId: string;
  code: string;
  name: string;
  type: (typeof responsibilityZones.$inferInsert)['type'];
  isShared?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(responsibilityZones)
    .where(
      and(eq(responsibilityZones.siteId, input.siteId), eq(responsibilityZones.code, input.code)),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(responsibilityZones)
    .values({ ...input, isShared: input.isShared ?? false })
    .returning();
  return row!;
}

async function ensureTerminal(siteId: string, name: string, deviceToken: string) {
  const deviceTokenHash = hashDeviceToken(deviceToken);
  const [existing] = await db
    .select()
    .from(qrTerminals)
    .where(eq(qrTerminals.deviceTokenHash, deviceTokenHash))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(qrTerminals)
    .values({ siteId, name, checkpoint: 'BOTH', deviceTokenHash })
    .returning();
  return row!;
}

async function main(): Promise<void> {
  // Site, DAY/NIGHT templates, positions and reason codes: the same defaults every tenant gets.
  const defaults = await seedTenantDefaults(db, { timezone: TIMEZONE });
  const site = { id: defaults.siteId, code: defaults.siteCode, timezone: TIMEZONE };
  const filling = await ensureOrgUnit(site.id, 'Цех фасовки');
  const packaging = await ensureOrgUnit(site.id, 'Цех упаковки');
  await ensureTeam(filling.id, 'Бригада А');
  await ensureTeam(filling.id, 'Бригада Б');
  await ensureTeam(packaging.id, 'Бригада А');
  await ensureTeam(packaging.id, 'Бригада Б');

  await ensureZone({
    siteId: site.id,
    orgUnitId: filling.id,
    code: 'FILL_LINE_1',
    name: 'Линия фасовки 1',
    type: 'FILLING',
  });
  await ensureZone({
    siteId: site.id,
    orgUnitId: filling.id,
    code: 'FILL_LINE_2',
    name: 'Линия фасовки 2',
    type: 'FILLING',
  });
  await ensureZone({
    siteId: site.id,
    orgUnitId: packaging.id,
    code: 'PACK_LINE_1',
    name: 'Линия упаковки 1',
    type: 'PACKAGING',
  });
  await ensureZone({
    siteId: site.id,
    orgUnitId: packaging.id,
    code: 'COMMON_CLEANING',
    name: 'Общая зона уборки',
    type: 'CLEANING',
    isShared: true,
  });

  let terminal: string | null = null;
  if (KIOSK_DEVICE_TOKEN && KIOSK_DEVICE_TOKEN.length >= 16) {
    terminal = (await ensureTerminal(site.id, 'Проходная', KIOSK_DEVICE_TOKEN)).name;
  }

  console.log(
    JSON.stringify(
      {
        site: site.code,
        timezone: site.timezone,
        orgUnits: [filling.name, packaging.name],
        reasonCodes: defaults.reasonCodes,
        positions: defaults.positions,
        terminal: terminal ?? 'пропущено: задайте KIOSK_DEVICE_TOKEN (≥16 символів) у .env',
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} finally {
  await client.end({ timeout: 5 });
}
