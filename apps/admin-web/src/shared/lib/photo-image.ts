import { queryOptions } from '@tanstack/react-query';

/** Decode before replacing visible evidence, using the browser's native image cache. */
export const photoImageQuery = (url: string) =>
  queryOptions({
    queryKey: ['photo-image', url] as const,
    queryFn: async () => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { url, width: image.naturalWidth, height: image.naturalHeight };
    },
    staleTime: Infinity,
    gcTime: 5 * 60_000,
    retry: false,
  });
