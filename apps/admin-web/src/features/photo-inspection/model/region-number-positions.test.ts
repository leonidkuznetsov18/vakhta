import { describe, expect, it } from 'vitest';
import { createImageAnnotatorState, type ImageAnnotation } from '@annotorious/annotorious';
import type { InspectionAnnotation } from '@vakhta/contracts';
import { RegionNumberPositions } from './region-number-positions';
import { toCanvas } from './editor';

const region: InspectionAnnotation = {
  id: '10000000-0000-4000-8000-000000000001',
  category: 'OTHER',
  comment: 'Visible object',
  sourceRunId: null,
  geometry: { type: 'RECTANGLE', x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
};
describe('live region number positions', () => {
  it('moves and resizes the number synchronously with canvas geometry before a review event', () => {
    const { store } = createImageAnnotatorState<ImageAnnotation, ImageAnnotation>({});
    store.addAnnotation(toCanvas(region, 1000, 800));
    const positions = new RegionNumberPositions();
    const element = document.createElement('span');
    positions.attach(region, element);
    const disconnect = positions.connect(store, 1000, 800);
    for (const [x, y] of [
      [0.3, 0.4],
      [0.35, 0.45],
      [0.25, 0.3],
    ] as const) {
      const updated = toCanvas(
        { ...region, geometry: { type: 'RECTANGLE', x, y, width: 0.3, height: 0.25 } },
        1000,
        800,
      );
      // Reproduce the library's stale bounds while current x/y/w/h already changed.
      updated.target.selector.geometry.bounds = toCanvas(
        region,
        1000,
        800,
      ).target.selector.geometry.bounds;
      store.updateTarget(updated.target);
      expect(element.style.left).toBe(`${x * 100}%`);
      expect(element.style.top).toBe(`${y * 100}%`);
    }
    // A React reattachment carrying stale review geometry must still use the live canvas.
    positions.attach(region, element);
    expect(element.style.left).toBe('25%');
    disconnect();
    store.updateTarget(toCanvas(region, 1000, 800).target);
    expect(element.style.left).toBe('25%');
  });
  it('tracks polygon vertex bounds and stops writing after a badge is removed', () => {
    const { store } = createImageAnnotatorState<ImageAnnotation, ImageAnnotation>({});
    const positions = new RegionNumberPositions();
    positions.connect(store, 1000, 800);
    const element = document.createElement('span');
    const detach = positions.attach(region, element);
    store.addAnnotation(
      toCanvas(
        {
          ...region,
          geometry: {
            type: 'POLYGON',
            points: [
              [0.4, 0.3],
              [0.5, 0.6],
              [0.2, 0.5],
            ],
          },
        },
        1000,
        800,
      ),
    );
    expect(element.style.left).toBe('20%');
    expect(element.style.top).toBe('30%');
    detach?.();
    store.updateTarget(toCanvas(region, 1000, 800).target);
    expect(element.style.left).toBe('20%');
  });
});
