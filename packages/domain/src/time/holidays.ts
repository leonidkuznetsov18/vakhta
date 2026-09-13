/**
 * Public holidays by region (calendar overlay). The region follows the site timezone; a site
 * outside the known regions simply has no holiday overlay. Names are catalog codes so the panel
 * localizes them. Dates are calendar days, never instants.
 */

export type HolidayRegion = 'UA';

export type HolidayCode =
  | 'NEW_YEAR'
  | 'WOMENS_DAY'
  | 'EASTER'
  | 'LABOUR_DAY'
  | 'REMEMBRANCE_DAY'
  | 'TRINITY'
  | 'CONSTITUTION_DAY'
  | 'STATEHOOD_DAY'
  | 'INDEPENDENCE_DAY'
  | 'DEFENDERS_DAY'
  | 'CHRISTMAS';

export interface Holiday {
  readonly date: string;
  readonly code: HolidayCode;
}

const REGION_BY_TIMEZONE: Readonly<Record<string, HolidayRegion>> = {
  'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA',
  'Europe/Uzhgorod': 'UA',
  'Europe/Zaporozhye': 'UA',
  'Europe/Simferopol': 'UA',
};

export function holidayRegion(timezone: string): HolidayRegion | null {
  return REGION_BY_TIMEZONE[timezone] ?? null;
}

/** Orthodox (Julian) Easter converted to the Gregorian calendar; valid for 1900–2099. */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  return julian.toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Ukrainian public holidays per the Labour Code as amended in 2023–2024. */
function ukraine(year: number): Holiday[] {
  const y = String(year);
  const easter = orthodoxEaster(year);
  const list: Holiday[] = [
    { date: `${y}-01-01`, code: 'NEW_YEAR' },
    { date: `${y}-03-08`, code: 'WOMENS_DAY' },
    { date: easter, code: 'EASTER' },
    { date: `${y}-05-01`, code: 'LABOUR_DAY' },
    { date: `${y}-05-08`, code: 'REMEMBRANCE_DAY' },
    { date: shift(easter, 49), code: 'TRINITY' },
    { date: `${y}-06-28`, code: 'CONSTITUTION_DAY' },
    { date: `${y}-07-15`, code: 'STATEHOOD_DAY' },
    { date: `${y}-08-24`, code: 'INDEPENDENCE_DAY' },
    { date: `${y}-10-01`, code: 'DEFENDERS_DAY' },
    { date: `${y}-12-25`, code: 'CHRISTMAS' },
  ];
  return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function holidaysOf(region: HolidayRegion, year: number): Holiday[] {
  switch (region) {
    case 'UA':
      return ukraine(year);
  }
}

/** Holidays of the region within an inclusive business-date range. */
export function holidaysBetween(region: HolidayRegion | null, from: string, to: string): Holiday[] {
  if (!region || from > to) return [];
  const first = Number(from.slice(0, 4));
  const last = Number(to.slice(0, 4));
  const result: Holiday[] = [];
  for (let year = first; year <= last; year += 1)
    for (const holiday of holidaysOf(region, year))
      if (holiday.date >= from && holiday.date <= to) result.push(holiday);
  return result;
}

/** Next occurrence (today or later) of a month-day such as a birthday; 29 Feb falls on 1 Mar. */
export function nextAnniversary(birthDate: string, today: string): string {
  const monthDay = birthDate.slice(5);
  const year = Number(today.slice(0, 4));
  const candidate = (y: number) => {
    const value = new Date(`${y}-${monthDay}T00:00:00Z`);
    return Number.isNaN(value.getTime()) ? `${y}-03-01` : value.toISOString().slice(0, 10);
  };
  const thisYear = candidate(year);
  return thisYear >= today ? thisYear : candidate(year + 1);
}
