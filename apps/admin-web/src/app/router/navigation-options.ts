import { linkOptions } from '@tanstack/react-router';
import type { SectionKey } from '@/navigation';

/** "tab/record" → its two route levels; either may be absent. */
function levels(sub: string | undefined): readonly [string | undefined, string | undefined] {
  if (!sub) return [undefined, undefined];
  const [first, second] = sub.split('/');
  return [first, second];
}

/** Translate the existing cross-feature navigation intent into typed route parameters. */
export function navigationOptions(section: SectionKey | 'profile', sub?: string) {
  switch (section) {
    case 'operations':
    case 'handover':
    case 'requests':
    case 'incidents':
    case 'bonus':
      return linkOptions({ to: `/${section}/{-$id}`, params: { id: sub } });
    case 'administration': {
      const [tab, detail] = levels(sub);
      return linkOptions({ to: '/administration/{-$tab}/{-$detail}', params: { tab, detail } });
    }
    case 'audit':
      return linkOptions({ to: '/audit/{-$tab}', params: { tab: sub } });
    case 'maintenance': {
      const [tab, id] = levels(sub);
      return linkOptions({ to: '/maintenance/{-$tab}/{-$id}', params: { tab, id } });
    }
    default:
      return linkOptions({ to: `/${section}` });
  }
}
