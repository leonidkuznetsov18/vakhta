/**
 * Довідники для локальної розробки і пілоту (ТЗ 18 п. 3, 6, 9; FR-DWN-01).
 * Ідемпотентний: повторний запуск нічого не дублює. Запуск: pnpm db:seed
 */
import { and, eq } from 'drizzle-orm';
import { hashDeviceToken } from '@vakhta/domain/node';
import { createDatabase } from './client.js';
import {
  orgUnits,
  positions,
  qrTerminals,
  reasonCodes,
  responsibilityZones,
  sites,
  teams,
} from './schema/index.js';

const DATABASE_URL = process.env['DATABASE_URL'];
if (!DATABASE_URL) throw new Error('DATABASE_URL не задано');
const TIMEZONE = process.env['DEFAULT_SITE_TIMEZONE'] ?? 'Europe/Kyiv';
const KIOSK_DEVICE_TOKEN = process.env['KIOSK_DEVICE_TOKEN'];

const { db, client } = createDatabase(DATABASE_URL, { max: 2 });

type ReasonSeed = {
  kind: (typeof reasonCodes.$inferInsert)['kind'];
  code: string;
  label: string;
  requiresComment?: boolean;
  requiresPhoto?: boolean;
  notifyMaster?: boolean;
  severity?: (typeof reasonCodes.$inferInsert)['severity'];
};

/** FR-DWN-01: причини простою. Тексти російською (NFR-08). */
const REASONS: ReasonSeed[] = [
  {
    kind: 'DOWNTIME',
    code: 'BREAKDOWN',
    label: 'Поломка',
    notifyMaster: true,
    requiresPhoto: true,
  },
  { kind: 'DOWNTIME', code: 'WAITING_MECHANIC', label: 'Ожидание наладчика', notifyMaster: true },
  { kind: 'DOWNTIME', code: 'NO_RAW_MATERIAL', label: 'Нет сырья', notifyMaster: true },
  { kind: 'DOWNTIME', code: 'NO_PACKAGING', label: 'Нет упаковки', notifyMaster: true },
  { kind: 'DOWNTIME', code: 'NO_STAFF', label: 'Нет сотрудника', notifyMaster: true },
  { kind: 'DOWNTIME', code: 'WAITING_MASTER', label: 'Ожидание мастера', notifyMaster: true },
  { kind: 'DOWNTIME', code: 'WAITING_QC', label: 'Ожидание контроля качества' },
  { kind: 'DOWNTIME', code: 'SANITATION', label: 'Санитарная обработка' },
  {
    kind: 'DOWNTIME',
    code: 'POWER',
    label: 'Электричество',
    notifyMaster: true,
    severity: 'CRITICAL',
  },
  { kind: 'DOWNTIME', code: 'ORGANIZATIONAL', label: 'Организационная причина' },
  {
    kind: 'DOWNTIME',
    code: 'SAFETY',
    label: 'Безопасность',
    notifyMaster: true,
    severity: 'SAFETY',
  },
  { kind: 'DOWNTIME', code: 'OTHER', label: 'Другое', requiresComment: true },
  { kind: 'EMERGENCY', code: 'MEDICAL', label: 'Медицинская причина', notifyMaster: true },
  { kind: 'EMERGENCY', code: 'FAMILY', label: 'Семейные обстоятельства', notifyMaster: true },
  { kind: 'EMERGENCY', code: 'OTHER', label: 'Другое', requiresComment: true, notifyMaster: true },
  { kind: 'CORRECTION', code: 'FORGOT_BUTTON', label: 'Забыл нажать кнопку' },
  { kind: 'CORRECTION', code: 'NO_CONNECTION', label: 'Не было связи' },
  { kind: 'CORRECTION', code: 'DEVICE_ISSUE', label: 'Проблема с телефоном' },
  { kind: 'CORRECTION', code: 'OTHER', label: 'Другое', requiresComment: true },
  { kind: 'HANDOVER', code: 'DIRT', label: 'Загрязнение' },
  { kind: 'HANDOVER', code: 'LEFTOVERS', label: 'Остатки продукции или сырья' },
  { kind: 'HANDOVER', code: 'TOOLS_MISSING', label: 'Нет инструмента на месте' },
  {
    kind: 'HANDOVER',
    code: 'DAMAGE',
    label: 'Повреждение или течь',
    notifyMaster: true,
    severity: 'CRITICAL',
  },
  { kind: 'HANDOVER', code: 'OTHER', label: 'Другое', requiresComment: true },
];

async function ensureSite() {
  const [existing] = await db.select().from(sites).where(eq(sites.code, 'main')).limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(sites)
    .values({ code: 'main', name: 'Основная площадка', timezone: TIMEZONE })
    .returning();
  return row!;
}

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

async function ensurePosition(code: string, name: string) {
  const [existing] = await db.select().from(positions).where(eq(positions.code, code)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(positions).values({ code, name }).returning();
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
  const site = await ensureSite();
  const filling = await ensureOrgUnit(site.id, 'Цех фасовки');
  const packaging = await ensureOrgUnit(site.id, 'Цех упаковки');
  await ensureTeam(filling.id, 'Бригада А');
  await ensureTeam(filling.id, 'Бригада Б');
  await ensureTeam(packaging.id, 'Бригада А');
  await ensureTeam(packaging.id, 'Бригада Б');

  await ensurePosition('OPERATOR', 'Оператор линии');
  await ensurePosition('SHIFT_MASTER', 'Мастер смены');
  await ensurePosition('MECHANIC', 'Наладчик');
  await ensurePosition('CLEANER', 'Уборщик');
  await ensurePosition('QC_INSPECTOR', 'Контролёр качества');

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

  for (const r of REASONS) {
    await db
      .insert(reasonCodes)
      .values({
        kind: r.kind,
        code: r.code,
        label: r.label,
        requiresComment: r.requiresComment ?? false,
        requiresPhoto: r.requiresPhoto ?? false,
        notifyMaster: r.notifyMaster ?? false,
        severity: r.severity ?? 'NORMAL',
      })
      .onConflictDoNothing();
  }

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
        reasonCodes: REASONS.length,
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
