import type { ComponentProps } from 'react';
import type { SectionKey } from '@/navigation';
import { useSidebar } from '@/components/ui/sidebar';
import { writeRoute } from '@/lib/route';

/** Native links keep browser affordances; one accepted navigation closes the mobile drawer. */
export function NavigationLink({
  section,
  sub,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & { section: SectionKey | 'profile'; sub?: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <a
      {...props}
      href={`#/${section}${sub ? `/${sub}` : ''}`}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          (props.target && props.target !== '_self')
        )
          return;
        event.preventDefault();
        if (writeRoute(section, sub)) setOpenMobile(false);
      }}
    />
  );
}
