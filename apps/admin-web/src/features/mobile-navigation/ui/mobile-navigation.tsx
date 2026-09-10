import { useState, type PointerEvent, type ReactNode } from 'react';
import { XIcon } from 'lucide-react';
import { messages } from '@vakhta/i18n';
import { currentLocale } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { createNavigationGesture } from '../model/gesture';
import { NAVIGATION_EDGE_WIDTH } from '../model/edge-swipe';
import { bindEdgeSwipe } from './bind-edge-swipe';

/** Extend the existing shadcn shell; gestures are optional alongside keyboard and menu buttons. */
export function MobileNavigation({ children }: { children: ReactNode }) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  const [gesture] = useState(createNavigationGesture);
  function start(event: PointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!isMobile || event.pointerType !== 'touch' || !(target instanceof Element)) return;
    if (!event.isPrimary) return gesture.cancel();
    if (!openMobile && event.clientX <= NAVIGATION_EDGE_WIDTH) return;
    if (
      !target.closest('[data-navigation-swipe]') ||
      target.closest(
        'input, textarea, select, button, a, [role="button"], [contenteditable="true"]',
      )
    )
      return;
    gesture.start({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      open: openMobile,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const open = gesture.finish({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    });
    if (isMobile && open !== null) setOpenMobile(open);
  }
  return (
    <div
      className="flex min-h-svh w-full min-w-0"
      ref={(node) => {
        if (node && isMobile && !openMobile) return bindEdgeSwipe(node, () => setOpenMobile(true));
      }}
      onPointerDownCapture={start}
      onPointerUpCapture={finish}
      onPointerCancelCapture={() => gesture.cancel()}
      onLostPointerCapture={() => gesture.cancel()}
      onClick={(event) => {
        if (
          isMobile &&
          openMobile &&
          !event.defaultPrevented &&
          event.target instanceof Element &&
          event.target.closest('[data-sidebar="menu-button"]')
        )
          setOpenMobile(false);
      }}
    >
      {children}
    </div>
  );
}

export function MobileNavigationClose() {
  const { setOpenMobile } = useSidebar();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="md:hidden"
      aria-label={messages(currentLocale()).ui.common.close}
      onClick={() => setOpenMobile(false)}
    >
      <XIcon />
    </Button>
  );
}
