import { useEffect, useState, type ReactNode } from 'react';
import { ExpandIcon } from 'lucide-react';
import type { MediaObjectView } from '@vakhta/contracts';
import { messages } from '@vakhta/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Muted } from '@/components/app/page';
import { describeError } from '@/errors';
import { currentLocale } from '@/i18n';
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
  onOpen,
  className,
}: {
  readonly media: MediaObjectView;
  readonly loadLink: LinkLoader;
  readonly label: string;
  readonly onOpen?: (url: string) => void;
  readonly className?: string;
}) {
  const t = messages(currentLocale()).admin.handover;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadLink(media.id)
      .then((l) => alive && setUrl(l.url))
      .catch((e: unknown) => alive && setFailed(describeError(e)));
    return () => {
      alive = false;
    };
  }, [media.id, loadLink]);

  if (failed) return <Muted className="text-destructive">{failed}</Muted>;
  if (!url) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <Skeleton className="aspect-[4/3] w-full rounded-md" />
        <Muted className="text-xs">{t.photoLoading}</Muted>
      </div>
    );
  }
  return (
    <figure className={cn('flex flex-col gap-1', className)}>
      <button
        type="button"
        className="group relative overflow-hidden rounded-md border bg-muted transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => onOpen?.(url)}
        aria-label={label}
      >
        <img src={url} alt={label} className="aspect-[4/3] w-full object-cover" loading="lazy" />
        <span className="absolute right-1.5 bottom-1.5 rounded-md bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ExpandIcon className="size-4" aria-hidden="true" />
        </span>
      </button>
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

export interface LightboxImage {
  readonly url: string;
  readonly label: string;
}

/** Full-size view; two images side by side when comparing the handover with the receiver's photo. */
export function Lightbox({
  images,
  onClose,
  title,
  extra,
}: {
  readonly images: readonly LightboxImage[];
  readonly onClose: () => void;
  readonly title: string;
  readonly extra?: ReactNode;
}) {
  return (
    <Dialog open={images.length > 0} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={cn('grid gap-3', images.length > 1 && 'md:grid-cols-2')}>
          {images.map((img) => (
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
        {extra}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            {messages(currentLocale()).ui.common.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
