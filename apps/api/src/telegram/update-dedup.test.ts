import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { eq, processedTelegramUpdates, sql } from '@vakhta/db';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { UpdateDedup } from './update-dedup.js';
let testDb: TestDatabase;
let dedup: UpdateDedup;
beforeAll(async () => {
  testDb = await startTestDatabase();
  dedup = new UpdateDedup(testDb.db);
});
afterAll(async () => testDb?.stop());
beforeEach(async () => {
  await testDb.db.delete(processedTelegramUpdates);
});
async function outcome(id: number) {
  const [row] = await testDb.db
    .select()
    .from(processedTelegramUpdates)
    .where(eq(processedTelegramUpdates.updateId, id));
  return row?.result;
}
it('admits one concurrent handler and records completion', async () => {
  const handle = vi.fn(async () => undefined);
  expect((await Promise.all([dedup.run(1, handle), dedup.run(1, handle)])).sort()).toEqual([
    'COMPLETED',
    'DUPLICATE',
  ]);
  expect(handle).toHaveBeenCalledOnce();
  expect(await outcome(1)).toEqual({ status: 'COMPLETED' });
});
it('records a safe failure classification and does not automatically repeat partial effects', async () => {
  const handle = vi.fn(async () => {
    throw new Error('private update contents');
  });
  await expect(dedup.run(2, handle)).rejects.toThrow('private update contents');
  expect(await outcome(2)).toEqual({ status: 'FAILED', code: 'HANDLER_FAILED' });
  expect(await dedup.run(2, handle)).toBe('DUPLICATE');
  expect(handle).toHaveBeenCalledOnce();
});
it('retains ambiguous PROCESSING after interrupted admission', async () => {
  await dedup.claim(3);
  const handle = vi.fn(async () => undefined);
  expect(await dedup.run(3, handle)).toBe('DUPLICATE');
  expect(handle).not.toHaveBeenCalled();
  expect(await outcome(3)).toEqual({ status: 'PROCESSING' });
});
it('does not claim success when completion persistence fails', async () => {
  await testDb.db
    .execute(sql`CREATE FUNCTION fail_update_completion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.result->>'status' = 'COMPLETED' THEN RAISE EXCEPTION 'injected completion failure'; END IF; RETURN NEW; END $$`);
  await testDb.db.execute(
    sql`CREATE TRIGGER fail_update_completion BEFORE UPDATE ON processed_telegram_updates FOR EACH ROW EXECUTE FUNCTION fail_update_completion()`,
  );
  const handle = vi.fn(async () => undefined);
  try {
    await expect(dedup.run(4, handle)).rejects.toThrow();
    expect(handle).toHaveBeenCalledOnce();
    expect(await outcome(4)).toEqual({ status: 'PROCESSING' });
  } finally {
    await testDb.db.execute(sql`DROP TRIGGER fail_update_completion ON processed_telegram_updates`);
    await testDb.db.execute(sql`DROP FUNCTION fail_update_completion()`);
  }
});
it('never runs a handler after admission persistence fails', async () => {
  const handle = vi.fn(async () => undefined);
  await expect(dedup.run(Number.NaN, handle)).rejects.toThrow();
  expect(handle).not.toHaveBeenCalled();
});
