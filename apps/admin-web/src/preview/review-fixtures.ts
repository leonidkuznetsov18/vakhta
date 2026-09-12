import {
  ChecklistDefinitionView,
  HandoverPhotoView,
  PhotoInspectionView,
  PhotoObjectsView,
} from '@vakhta/contracts';

const id = '10000000-0000-4000-8000-000000000001';
const time = '2026-09-12T08:00:00Z';
export const reviewObjects = PhotoObjectsView.parse({
  canEdit: true,
  objects: ['Інструмент', 'Стаканчик', 'Ганчірка', 'Відро'].map((name, index) => ({
    id: `40000000-0000-4000-8000-00000000000${index + 1}`,
    name,
    color: ['#007aff', '#b98300', '#df284b', '#39831c'][index],
    active: true,
  })),
});
const notes = [
  'Ключ, викрутка, молоток. Перевірте відкриті поверхні та простір біля обладнання.',
  'Великі й малі. Стаканчики у гніздах машини є продукцією і дозволені.',
  'Брудна, біла, чорна, синя, червона; перевірте простір під столом.',
  'Зелене, червоне, чорне, біле; з водою або порожнє.',
];
export const reviewRules = {
  version: 1,
  canEdit: true,
  rules: reviewObjects.objects.map((object, index) => ({
    objectId: object.id,
    name: object.name,
    note: notes[index] ?? '',
  })),
};
export const reviewPhotos = [
  { label: 'Обладнання — загальний вигляд', width: 720, height: 1280 },
  { label: 'Робоча поверхня — вигляд зверху', width: 1280, height: 720 },
  { label: 'Квадратне фото', width: 960, height: 960 },
  { label: 'Панорамне фото', width: 2400, height: 600 },
  { label: 'Вузьке портретне фото', width: 600, height: 2400 },
].map((photo, index) =>
  HandoverPhotoView.parse({
    itemKey: `PHOTO_${index + 1}`,
    label: photo.label,
    media: {
      id: `20000000-0000-4000-8000-00000000000${index + 1}`,
      quality: 'OK',
      width: photo.width,
      height: photo.height,
      receivedAt: time,
      processedAt: time,
      duplicateOfId: null,
    },
    inspection: null,
  }),
);
export const reviewChecklist = ChecklistDefinitionView.parse({
  id,
  familyId: id,
  name: 'Перевірка робочого місця',
  version: 4,
  positions: [{ id, name: 'Оператор' }],
  zoneType: null,
  isActive: true,
  validFrom: time,
  createdAt: time,
  handovers: 42,
  items: [
    { key: 'SURFACE', kind: 'CHECK', label: 'Робочі поверхні чисті та протерті' },
    { key: 'TOOLS', kind: 'CHECK', label: 'Інструменти на місцях' },
    ...reviewPhotos.map((photo) => ({ key: photo.itemKey, kind: 'PHOTO', label: photo.label })),
  ],
});
/** Synthetic diagram: tests aspect ratios without copying any employee evidence. */
function photoLink(photo: HandoverPhotoView) {
  const { width, height } = photo.media;
  if (!width || !height) throw new Error('Preview photo dimensions are required');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="#dae3e8" stroke="#315264" stroke-width="6"/><svg x="0" y="0" width="${width}" height="${height}" viewBox="0 0 720 1280" preserveAspectRatio="xMidYMid meet"><rect x="100" y="80" width="520" height="1120" rx="20" fill="#8698a1"/><rect x="150" y="150" width="420" height="580" fill="#edf3f5"/><path d="M200 200V650H520M200 400H500M360 200V650" stroke="#425560" stroke-width="24" fill="none"/><rect x="150" y="780" width="420" height="340" fill="#526875"/><circle cx="360" cy="920" r="75" fill="#adc1cb"/></svg><text x="${width / 2}" y="35" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#263945">TOP · ${width} × ${height}</text><text x="${width / 2}" y="${height - 15}" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#263945">BOTTOM</text></svg>`;
  return {
    url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    expiresAt: '2099-01-01T00:00:00Z',
  };
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
/** Read-only fixtures; writes deliberately fail so preview never pretends to persist work. */
export function reviewFixture(path: string, method: string): Response | null {
  const match = path.match(/^\/admin\/handovers\/hv1\/photos\/([^/]+)\/[^/]+\/inspection(.*)$/);
  const handled =
    path === '/admin/org/checklists' ||
    path === '/admin/photo-objects' ||
    path.endsWith('/photo-rules') ||
    path.startsWith('/admin/handovers/media/') ||
    Boolean(match);
  if (!handled) return null;
  if (method !== 'GET')
    return json({ code: 'PREVIEW_READ_ONLY', message: 'Preview does not persist changes' }, 405);
  if (path === '/admin/org/checklists') return json([reviewChecklist]);
  if (path === '/admin/photo-objects') return json(reviewObjects);
  if (path.endsWith('/photo-rules')) return json(reviewRules);
  const photo = reviewPhotos.find((item) => path.includes(item.media.id));
  if (!photo) return json({ message: 'Preview photo not found' }, 404);
  if (path.endsWith('/link')) return json(photoLink(photo));
  if (path.endsWith('/limits'))
    return json({
      windowHours: 24,
      perPhoto: { used: 1, limit: 5 },
      global: { used: 14, limit: 1000 },
    });
  return json(
    PhotoInspectionView.parse({
      version: 0,
      canEdit: true,
      updatedAt: null,
      updatedBy: null,
      rules: reviewRules.rules,
      review: {
        status: 'PROBLEMS',
        annotations: [
          {
            id,
            geometry: { type: 'RECTANGLE', x: 0.25, y: 0.25, width: 0.35, height: 0.2 },
            objectId: reviewObjects.objects[0]?.id,
            objectName: 'Інструмент',
            verdict: 'VIOLATION',
            comment: '',
          },
        ],
        comment: '',
        guidance: '',
        isReference: false,
        rejectedFindings: [],
      },
      runs: [
        {
          id,
          status: photo.itemKey === 'PHOTO_4' ? 'SUCCEEDED' : 'FAILED',
          model: 'preview',
          promptVersion: 'preview',
          requestedAt: time,
          completedAt: time,
          errorCode: photo.itemKey === 'PHOTO_4' ? null : 'MODEL_ERROR',
          prediction:
            photo.itemKey === 'PHOTO_4'
              ? {
                  status: 'PROBLEMS',
                  summary: 'Приклад довгого опису для перевірки перенесення тексту',
                  limitations: '',
                  findings: [
                    {
                      category: 'OTHER',
                      objectId: reviewObjects.objects[0]?.id,
                      objectName: 'Інструмент',
                      comment:
                        'На робочій поверхні залишено інструмент. Перевірте його розташування та переконайтеся, що він не заважає безпечному доступу до обладнання.',
                      geometry: { type: 'RECTANGLE', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
                    },
                  ],
                }
              : null,
          reviewVersion: 0,
          feedback: null,
        },
      ],
      context: {
        schemaVersion: 1,
        handoverId: id,
        mediaId: photo.media.id,
        itemKey: photo.itemKey,
        checklistDefinitionId: id,
        checklistVersion: 4,
        photoLabel: photo.label,
        checklist: [],
        zoneId: null,
        zoneName: null,
        shiftSessionId: id,
        businessDate: '2026-09-12',
        sha256: 'a'.repeat(64),
        encodedWidth: photo.media.width,
        encodedHeight: photo.media.height,
        contentType: 'image/svg+xml',
        orientationPolicy: 'EXIF_AUTO_ORIENT',
      },
    }),
  );
}
