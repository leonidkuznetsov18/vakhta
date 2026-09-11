import { afterEach, expect, it, vi } from 'vitest';
import { InspectionEditor } from './editor';
import { regionAnchor } from './region-navigation';
vi.mock('@annotorious/annotorious', () => ({
  createImageAnnotator: vi.fn(),
  ShapeType: {},
  UserSelectAction: {},
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('anchors rectangle and polygon labels to their bounds', () => {
  expect(regionAnchor({ type: 'RECTANGLE', x: 0.2, y: 0.3, width: 0.2, height: 0.2 })).toEqual({
    x: 0.2,
    y: 0.3,
  });
  expect(
    regionAnchor({
      type: 'POLYGON',
      points: [
        [0.3, 0.4],
        [0.2, 0.6],
        [0.5, 0.3],
      ],
    }),
  ).toEqual({ x: 0.2, y: 0.3 });
});
it('scrolls the selected card inside its list and unsubscribes on unmount', () => {
  vi.useFakeTimers();
  const editor = new InspectionEditor({
    context: {
      schemaVersion: 1,
      handoverId: crypto.randomUUID(),
      mediaId: crypto.randomUUID(),
      itemKey: 'photo',
      checklistDefinitionId: crypto.randomUUID(),
      checklistVersion: 1,
      photoLabel: 'Photo',
      checklist: [],
      zoneId: null,
      zoneName: null,
      shiftSessionId: crypto.randomUUID(),
      businessDate: '2026-09-11',
      sha256: 'test',
      encodedWidth: 100,
      encodedHeight: 100,
      contentType: 'image/jpeg',
      orientationPolicy: 'EXIF_AUTO_ORIENT',
    },
    updatedAt: null,
    updatedBy: null,
    version: 0,
    canEdit: true,
    runs: [],
    rules: [],
    review: {
      status: 'UNREVIEWED',
      annotations: [],
      comment: '',
      guidance: '',
      isReference: false,
      rejectedFindings: [],
    },
  });
  const list = document.createElement('div');
  const card = document.createElement('div');
  card.dataset.regionId = 'selected';
  list.append(card);
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 300, 100));
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 350, 300, 80));
  list.scrollTo = vi.fn();
  card.scrollIntoView = vi.fn();
  // Laid out in the page flow: the card asks its scrolling ancestor for the nearest position.
  const flow = editor.attachRegionList(list);
  editor.select('selected');
  vi.runAllTimers();
  expect(card.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'instant' });
  expect(list.scrollTo).not.toHaveBeenCalled();
  flow?.();
  editor.select('other');
  // A list that scrolls on its own moves only itself.
  Object.defineProperty(list, 'scrollHeight', { value: 500 });
  Object.defineProperty(list, 'clientHeight', { value: 100 });
  const cleanup = editor.attachRegionList(list);
  editor.select('selected');
  vi.runAllTimers();
  expect(list.scrollTo).toHaveBeenCalledWith({ top: 250, behavior: 'instant' });
  cleanup?.();
  editor.select('other');
  editor.select('selected');
  vi.runAllTimers();
  expect(list.scrollTo).toHaveBeenCalledTimes(1);
});
