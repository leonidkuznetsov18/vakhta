import { sql, type Transaction } from '@vakhta/db';

/** Read after the business mutex because the deadline may pass while acquisition waits. */
export async function timerNow(tx: Transaction, testTime?: Date): Promise<Date> {
  if (testTime) return testTime;
  const [row] = await tx.execute<{ milliseconds: number }>(
    sql`select (extract(epoch from clock_timestamp()) * 1000)::double precision as milliseconds`,
  );
  if (!row || !Number.isFinite(row.milliseconds)) throw new Error('Timer clock unavailable');
  return new Date(row.milliseconds);
}
