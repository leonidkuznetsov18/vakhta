/**
 * Directories every tenant starts with (spec 18 items 3, 6, 9; FR-DWN-01): the first site, the two
 * shift templates, the standard positions and the downtime reason codes. Idempotent: rerunning
 * changes nothing. Units, teams, zones and terminals are the tenant administrator's job.
 */
import { and, eq } from 'drizzle-orm';
import type { Database } from './client.js';
import { positions, reasonCodes, shiftTemplates, sites } from './schema/index.js';

export interface TenantDefaultsInput {
  readonly timezone: string;
  readonly siteCode?: string | undefined;
  readonly siteName?: string | undefined;
}

export interface TenantDefaultsResult {
  readonly siteId: string;
  readonly siteCode: string;
  readonly positions: number;
  readonly reasonCodes: number;
}

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
  { kind: 'ADJUSTMENT', code: 'MASTER_REVIEW', label: 'Проверка мастера' },
  { kind: 'ADJUSTMENT', code: 'SYSTEM_INCIDENT', label: 'Технический сбой' },
  { kind: 'ADJUSTMENT', code: 'APPEAL_DECISION', label: 'Решение по апелляции' },
  { kind: 'ADJUSTMENT', code: 'OTHER', label: 'Другое', requiresComment: true },
];

const POSITIONS: ReadonlyArray<readonly [string, string]> = [
  ['OPERATOR', 'Оператор линии'],
  ['SHIFT_MASTER', 'Мастер смены'],
  ['MECHANIC', 'Наладчик'],
  ['CLEANER', 'Уборщик'],
  ['QC_INSPECTOR', 'Контролёр качества'],
];

interface SiteSeed {
  readonly code: string;
  readonly name: string;
  readonly timezone: string;
}

async function ensureSite(db: Database, site: SiteSeed) {
  const [existing] = await db.select().from(sites).where(eq(sites.code, site.code)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(sites).values(site).returning();
  if (!row) throw new Error('sites: insert returned no row');
  return row;
}

interface TemplateSeed {
  readonly code: string;
  readonly name: string;
  readonly localStart: string;
  readonly localEnd: string;
  readonly isNight: boolean;
}

async function ensureTemplate(db: Database, siteId: string, template: TemplateSeed) {
  const [existing] = await db
    .select()
    .from(shiftTemplates)
    .where(and(eq(shiftTemplates.siteId, siteId), eq(shiftTemplates.code, template.code)))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(shiftTemplates)
    .values({ siteId, ...template })
    .returning();
  if (!row) throw new Error('shift_templates: insert returned no row');
  return row;
}

async function ensurePosition(db: Database, code: string, name: string) {
  const [existing] = await db.select().from(positions).where(eq(positions.code, code)).limit(1);
  if (existing) return existing;
  const [row] = await db.insert(positions).values({ code, name }).returning();
  if (!row) throw new Error('positions: insert returned no row');
  return row;
}

export async function seedTenantDefaults(
  db: Database,
  input: TenantDefaultsInput,
): Promise<TenantDefaultsResult> {
  const siteCode = input.siteCode ?? 'main';
  const site = await ensureSite(db, {
    code: siteCode,
    name: input.siteName ?? 'Основная площадка',
    timezone: input.timezone,
  });
  await ensureTemplate(db, site.id, {
    code: 'DAY',
    name: 'Дневная смена',
    localStart: '08:00',
    localEnd: '20:00',
    isNight: false,
  });
  await ensureTemplate(db, site.id, {
    code: 'NIGHT',
    name: 'Ночная смена',
    localStart: '20:00',
    localEnd: '08:00',
    isNight: true,
  });
  await Promise.all(POSITIONS.map(([code, name]) => ensurePosition(db, code, name)));
  await db
    .insert(reasonCodes)
    .values(
      REASONS.map((r) => ({
        kind: r.kind,
        code: r.code,
        label: r.label,
        requiresComment: r.requiresComment ?? false,
        requiresPhoto: r.requiresPhoto ?? false,
        notifyMaster: r.notifyMaster ?? false,
        severity: r.severity ?? 'NORMAL',
      })),
    )
    .onConflictDoNothing();
  return { siteId: site.id, siteCode, positions: POSITIONS.length, reasonCodes: REASONS.length };
}
