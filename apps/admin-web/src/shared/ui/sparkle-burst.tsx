import type { CSSProperties } from 'react';
import { cn } from 'cn';

/**
 * Sparks thrown from one point, drawn in CSS alone: a burst is a set of elements that animate as
 * they mount, so mounting it under a new key is the whole trigger and nothing has to be started,
 * stopped or cleaned up.
 *
 * The table is written down rather than drawn from a random generator: a render must be pure, and
 * a burst that looks the same every time is also a burst that can be looked at in a screenshot.
 * `x` and `y` are where a spark ends up, `peak` how high it rises on the way — that arc is what
 * makes it read as thrown rather than pushed.
 */
interface Spark {
  readonly x: number;
  readonly y: number;
  readonly peak: number;
  readonly size: number;
  readonly spin: number;
  readonly delay: number;
  readonly hue: number;
}

const SPARKS: readonly Spark[] = [
  { x: -34, y: 20, peak: -26, size: 7, spin: -220, delay: 0, hue: 8 },
  { x: -22, y: 26, peak: -34, size: 5, spin: 180, delay: 40, hue: 5 },
  { x: -11, y: 16, peak: -30, size: 4, spin: -140, delay: 90, hue: 1 },
  { x: -3, y: 30, peak: -42, size: 8, spin: 260, delay: 20, hue: 8 },
  { x: 7, y: 22, peak: -38, size: 5, spin: -200, delay: 110, hue: 4 },
  { x: 16, y: 28, peak: -30, size: 6, spin: 160, delay: 60, hue: 5 },
  { x: 26, y: 18, peak: -36, size: 4, spin: -260, delay: 0, hue: 8 },
  { x: 36, y: 26, peak: -24, size: 7, spin: 200, delay: 130, hue: 1 },
  { x: 47, y: 16, peak: -30, size: 5, spin: -180, delay: 70, hue: 4 },
  { x: 58, y: 24, peak: -20, size: 6, spin: 240, delay: 30, hue: 8 },
  { x: -28, y: -4, peak: -20, size: 4, spin: 140, delay: 150, hue: 5 },
  { x: 30, y: -8, peak: -22, size: 5, spin: -160, delay: 170, hue: 1 },
  { x: 12, y: -12, peak: -26, size: 4, spin: 220, delay: 190, hue: 8 },
  { x: 66, y: 6, peak: -16, size: 4, spin: -120, delay: 100, hue: 4 },
  { x: -44, y: 8, peak: -18, size: 5, spin: 180, delay: 140, hue: 8 },
  { x: 44, y: 38, peak: -12, size: 4, spin: -240, delay: 200, hue: 5 },
  { x: -14, y: 40, peak: -14, size: 5, spin: 200, delay: 210, hue: 1 },
  { x: 22, y: 44, peak: -10, size: 4, spin: -180, delay: 230, hue: 8 },
];

/**
 * Positioned by the caller: place it where the sparks should come from — the tip of a wand, the
 * corner of a card — and they fan out from there over whatever is around it.
 */
export function SparkleBurst({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden="true" className={cn('pointer-events-none absolute size-0', className)}>
      {SPARKS.map((spark, index) => (
        <span
          // The table is fixed, so the index is the identity: spark three is always spark three.
          key={index}
          className="spark"
          style={
            {
              '--spark-x': `${spark.x}px`,
              '--spark-y': `${spark.y}px`,
              '--spark-peak': `${spark.peak}px`,
              '--spark-size': `${spark.size}px`,
              '--spark-spin': `${spark.spin}deg`,
              '--spark-color': `var(--chart-${spark.hue})`,
              animationDelay: `${spark.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
