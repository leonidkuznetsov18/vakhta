import { QueryFeedback } from '@/components/app/query-feedback';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, ExpandIcon } from 'lucide-react';
import type { MediaObjectView } from '@vakhta/contracts';
import { format, messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Muted } from '@/components/app/page';
import { currentLocale } from '@/i18n';
import { keys } from '@/lib/query';
import { cn } from 'cn';

type LinkLoader = (mediaId: string) => Promise<{ url: string }>;

/**
 * Thumbnail behind a signed, short-lived link (FR-PHO-06). The link is fetched when the
 * thumbnail mounts, so every view still lands in the audit log; a click opens the lightbox.
 */
export function PhotoThumb({
  media,
  loadLink,
  label,
  badge,
  showCaption = true,
  onOpen,
  className,
}: {
  readonly media: MediaObjectView;
  readonly loadLink: LinkLoader;
  readonly label: string;
  /** Short marker drawn over the image (quality, "after"). */
  readonly badge?: string;
  /** Hide redundant visible metadata while retaining accessible and lightbox labels. */
  readonly showCaption?: boolean;
  readonly onOpen?: (url: string) => void;
  readonly className?: string;
}) {
  const t = messages(currentLocale()).admin.handover;
  // Nothing is kept: a link is signed for minutes, and asking for it again is the audit entry
  // that says the photo was looked at. So this query is stale the moment it lands.
  const link = useQuery({
    queryKey: keys.media(media.id),
    queryFn: () => loadLink(media.id),
    staleTime: 0,
    gcTime: 0,
  });
  const url = link.data?.url ?? null;
  if (link.isError || link.fetchStatus === 'paused') return <QueryFeedback query={link} />;
  if (!url) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <Skeleton className="aspect-[4/3] w-full rounded-md" />
        <Muted className="text-xs">{t.photoLoading}</Muted>
      </div>
    );
  }
  return (
    <figure className={cn('flex min-w-0 flex-col gap-1', className)}>
      <button
        type="button"
        className="group relative w-full overflow-hidden rounded-md border bg-muted transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => onOpen?.(url)}
        aria-label={label}
      >
        <img src={url} alt={label} className="aspect-[4/3] w-full object-cover" loading="lazy" />
        {badge && (
          <span className="absolute top-1.5 left-1.5 rounded-md bg-background/85 px-1.5 py-0.5 text-[11px] font-medium">
            {badge}
          </span>
        )}
        <span className="absolute right-1.5 bottom-1.5 rounded-md bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ExpandIcon className="size-4" aria-hidden="true" />
        </span>
      </button>
      {showCaption && (
        <figcaption
          className="line-clamp-2 text-xs leading-snug text-muted-foreground"
          title={label}
        >
          {label}
        </figcaption>
      )}
    </figure>
  );
}

export interface LightboxImage {
  readonly url: string;
  readonly label: string;
}

/**
 * Full-size view. Two images render side by side (comparing the handover with the receiver's
 * photo); three or more become a gallery with previous/next navigation starting at `start`.
 */
export function Lightbox({
  images,
  onClose,
  title,
  extra,
  start = 0,
}: {
  readonly images: readonly LightboxImage[];
  readonly onClose: () => void;
  readonly title: string;
  readonly extra?: ReactNode;
  readonly start?: number;
}) {
  const t = messages(currentLocale());
  // Which of these images is on screen. Remembered against the set it belongs to, so a new set —
  // another row's photos — opens at its own starting image instead of the previous one's index.
  const [chosen, setChosen] = useState<{
    readonly of: readonly LightboxImage[];
    readonly index: number;
  } | null>(null);
  const index = chosen?.of === images ? chosen.index : start;
  const setIndex = (next: number) => setChosen({ of: images, index: next });
  const gallery = images.length > 2;
  const shown = gallery ? [images[Math.min(index, images.length - 1)]!] : images;
  const step = (delta: number) => setIndex((index + delta + images.length) % images.length);
  return (
    <Dialog open={images.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-5xl"
        onKeyDown={(e) => {
          if (!gallery) return;
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {title}
            {gallery && (
              <Muted className="ml-2 text-sm font-normal">
                {format(t.admin.handover.photoCounter, { index: index + 1, total: images.length })}
              </Muted>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className={cn('grid gap-3', shown.length > 1 && 'md:grid-cols-2')}>
          {shown.map((img) => (
            <figure key={img.url} className="flex flex-col gap-1">
              <img
                src={img.url}
                alt={img.label}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <figcaption className="text-sm text-muted-foreground">{img.label}</figcaption>
            </figure>
          ))}
        </div>
        {gallery && (
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => step(-1)}
              aria-label={t.admin.handover.prevPhoto}
            >
              <ChevronLeftIcon aria-hidden="true" />
              {t.admin.handover.prevPhoto}
            </Button>
            <div className="flex min-w-0 flex-1 flex-wrap justify-center gap-1">
              {images.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  className={cn(
                    'size-12 overflow-hidden rounded border transition-opacity hover:opacity-100',
                    i === index ? 'ring-2 ring-ring' : 'opacity-60',
                  )}
                  onClick={() => setIndex(i)}
                  aria-label={img.label}
                  aria-current={i === index}
                >
                  <img src={img.url} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => step(1)}
              aria-label={t.admin.handover.nextPhoto}
            >
              {t.admin.handover.nextPhoto}
              <ChevronRightIcon aria-hidden="true" />
            </Button>
          </div>
        )}
        {extra}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {t.ui.common.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
