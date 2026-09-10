import { useMediaQuery } from '@/lib/media-query';

const MOBILE_BREAKPOINT = 768;

/** Whether the viewport is phone-sized. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
