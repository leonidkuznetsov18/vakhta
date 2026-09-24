import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoInspectionDialog } from '@/features/photo-inspection';
import { Lightbox, PhotoThumb } from '@/components/app/photo';
import { reviewPhotos } from './review-fixtures';
import { apiFetch } from '@/api';
import { MediaLinkView } from '@vakhta/contracts';
import { QueryActivity } from '@/shared/ui/query-activity';
import '@/index.css';

if (!import.meta.env.DEV) throw new Error('Photo fixture is development-only');
const showThumbnails = !new URLSearchParams(location.search).has('without-thumbnails');
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const images = reviewPhotos.map((photo) => ({
  url: `/test-photo/${photo.media.id}.svg`,
  label: photo.label,
}));
function Fixture() {
  const [inspection, setInspection] = useState<{
    photo: (typeof reviewPhotos)[number];
    sessionId: string;
  } | null>(null);
  const open = (photo: (typeof reviewPhotos)[number] | undefined) => {
    if (photo) setInspection({ photo, sessionId: crypto.randomUUID() });
  };
  const [lightbox, setLightbox] = useState(false);
  return (
    <QueryClientProvider client={client}>
      <header
        data-testid="page-header"
        className="flex h-14 items-center justify-between border-b px-4"
      >
        <h1>Photos</h1>
        <div data-testid="page-activity">
          <QueryActivity />
        </div>
      </header>
      <main className="flex flex-col gap-6 p-4 md:p-6">
        <div data-testid="page-content">
          <button onClick={() => open(reviewPhotos[0])}>Inspect photos</button>
          <button onClick={() => setLightbox(true)}>View gallery</button>
          <div className="grid grid-cols-3 gap-4">
            {showThumbnails &&
              reviewPhotos.map((item) => (
                <PhotoThumb
                  key={item.media.id}
                  media={item.media}
                  label={item.label}
                  loadLink={async (id) =>
                    MediaLinkView.parse(await apiFetch(`/admin/handovers/media/${id}/link`))
                  }
                  onOpen={() => open(item)}
                />
              ))}
          </div>
        </div>
      </main>
      {inspection && (
        <PhotoInspectionDialog
          handoverId="hv1"
          sessionId={inspection.sessionId}
          photo={inspection.photo}
          photos={reviewPhotos}
          onPhotoChange={(photo) => setInspection({ ...inspection, photo })}
          onClose={() => setInspection(null)}
        />
      )}
      {lightbox && <Lightbox images={images} title="Photos" onClose={() => setLightbox(false)} />}
    </QueryClientProvider>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Fixture />);
