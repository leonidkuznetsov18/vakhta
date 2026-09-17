import { useQuery } from '@tanstack/react-query';
import { photoImageQuery } from '@/shared/lib/photo-image';
import { PhotoLoadState } from './photo-load-state';
import { useId, useState } from 'react';
import { useStore } from 'zustand';
import { RotateCcwIcon, ZoomInIcon, ZoomOutIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { currentLocale } from '@/i18n';
import { createPhotoZoom } from '@/shared/lib/photo-zoom';

export function ZoomablePhoto({
  url,
  label,
  loading,
}: {
  readonly url: string;
  readonly label: string;
  readonly loading?: string | undefined;
}) {
  const image = useQuery(photoImageQuery(url));
  const t = messages(currentLocale()).admin.handover;
  const [{ store, attach, zoomIn, zoomOut, reset, pan }] = useState(createPhotoZoom);
  const scale = useStore(store, (state) => state.scale);
  const hintId = useId();
  return (
    <figure
      className="flex min-h-0 min-w-0 flex-col gap-2"
      onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === '+' || event.key === '=') zoomIn();
        else if (event.key === '-') zoomOut();
        else if (event.key === '0') reset();
        else {
          const movement: Record<string, readonly [number, number]> = {
            ArrowLeft: [60, 0],
            ArrowRight: [-60, 0],
            ArrowUp: [0, 60],
            ArrowDown: [0, -60],
          };
          const delta = movement[event.key];
          if (!delta || !pan(...delta)) return;
        }
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="flex items-center justify-center gap-2" role="group" aria-label={label}>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={zoomOut}
          disabled={scale <= 1}
          aria-label={t.zoomOut}
          title={t.zoomOut}
        >
          <ZoomOutIcon aria-hidden="true" />
        </Button>
        <output className="min-w-14 text-center text-sm tabular-nums" aria-label={t.zoomLevel}>
          {Math.round(scale * 100)}%
        </output>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={zoomIn}
          disabled={scale >= 5}
          aria-label={t.zoomIn}
          title={t.zoomIn}
        >
          <ZoomInIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={reset}
          disabled={scale <= 1}
          aria-label={t.resetZoom}
          title={t.resetZoom}
        >
          <RotateCcwIcon aria-hidden="true" />
        </Button>
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        className="relative h-[min(55dvh,36rem)] shrink-0 overflow-auto rounded-md bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {(!image.data || loading) && (
          <PhotoLoadState
            failed={image.isError}
            paused={image.fetchStatus === 'paused'}
            label={loading}
            retry={() => void image.refetch()}
          />
        )}
        <img
          ref={image.data ? attach : undefined}
          src={url}
          alt={label}
          draggable={false}
          className="h-auto w-full object-contain lg:size-full"
          style={{ opacity: image.data ? 1 : 0 }}
        />
      </div>
      <figcaption className="h-10 shrink-0 overflow-y-auto text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
        {label}
      </figcaption>
      <p id={hintId} className="text-xs text-muted-foreground">
        {t.zoomHint}
      </p>
    </figure>
  );
}
