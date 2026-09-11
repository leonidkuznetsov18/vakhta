import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { photoObjects, sql } from '@vakhta/db';
import { photoObjectKey } from '@vakhta/contracts';
import type { WebUser } from '../auth/web-auth.guard.js';
import { AuditLog } from '../events/audit-log.js';
import { startTestDatabase, type TestDatabase } from '../../test/db.js';
import { PhotoObjectsService } from './photo-objects.service.js';

const master: WebUser = {
  id: randomUUID(),
  email: 'master@example.test',
  name: 'Master',
  twoFactorEnabled: false,
  grants: [{ role: 'SHIFT_MASTER', scopeType: 'ENTERPRISE', scopeId: null }],
};
describe('photo object catalog', () => {
  let fixture: TestDatabase;
  let service: PhotoObjectsService;
  beforeAll(async () => {
    fixture = await startTestDatabase();
    service = new PhotoObjectsService(fixture.db, new AuditLog());
  });
  afterAll(async () => {
    await fixture?.stop();
  });
  beforeEach(async () => {
    await fixture.db.execute(sql`TRUNCATE photo_objects CASCADE`);
  });
  it('keeps one entry per spelling family and reuses it for a plural or differently cased name', async () => {
    expect(photoObjectKey(' Ганчірки ')).toBe(photoObjectKey('ганчірка'));
    expect(photoObjectKey('Інструмент')).toBe(photoObjectKey('Інструменти'));
    expect(photoObjectKey('Стіл')).not.toBe(photoObjectKey('Столи'));
    const first = await service.create({ name: 'Ганчірка' }, master);
    expect(await service.create({ name: 'ганчірки' }, master)).toEqual(first);
    expect(await service.create({ name: 'Ганчірка' }, master)).toEqual(first);
    const list = await service.list(master);
    expect(list.objects.map((object) => object.name)).toEqual(['Ганчірка']);
    // The database refuses a second active spelling of the same family from any writer.
    await expect(
      fixture.db
        .insert(photoObjects)
        .values({ name: 'Ганчірки', color: '#ffd60a', updatedBy: 'other' }),
    ).rejects.toThrow();
  });
  it('refuses creation without a reviewer role and reactivates a retired entry on reuse', async () => {
    const viewer: WebUser = {
      ...master,
      grants: [{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }],
    };
    await expect(service.create({ name: 'Піддони' }, viewer)).rejects.toMatchObject({
      code: 'INSPECTION_FORBIDDEN',
    });
    expect((await service.list(viewer)).canEdit).toBe(false);
    const created = await service.create({ name: 'Піддони' }, master);
    await fixture.db.update(photoObjects).set({ active: false });
    expect((await service.create({ name: 'піддон' }, master)).id).toBe(created.id);
    expect((await service.list(master)).objects[0]?.active).toBe(true);
  });
  it('renames an entry, refuses a spelling another entry owns, and retires an entry', async () => {
    const rag = await service.create({ name: 'Ганчірка' }, master);
    const cup = await service.create({ name: 'Стаканчик' }, master);
    expect(cup.color).not.toBe(rag.color);
    const renamed = await service.update(rag.id, { name: 'Ганчірка для верстата' }, master);
    expect(renamed).toMatchObject({ id: rag.id, name: 'Ганчірка для верстата', color: rag.color });
    await expect(
      service.update(cup.id, { name: 'ганчірка для верстата' }, master),
    ).rejects.toMatchObject({ code: 'PHOTO_OBJECT_EXISTS' });
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { active: false }, master),
    ).rejects.toMatchObject({ code: 'PHOTO_OBJECT_NOT_FOUND' });
    const retired = await service.update(cup.id, { active: false }, master);
    expect(retired.active).toBe(false);
    expect((await service.list(master)).objects.map((o) => [o.name, o.active])).toEqual([
      ['Ганчірка для верстата', true],
      ['Стаканчик', false],
    ]);
    const viewer: WebUser = {
      ...master,
      grants: [{ role: 'HR', scopeType: 'ENTERPRISE', scopeId: null }],
    };
    await expect(service.update(rag.id, { name: 'x' }, viewer)).rejects.toMatchObject({
      code: 'INSPECTION_FORBIDDEN',
    });
  });
});
